import type {
  AuthStatus,
  BankedResets,
  RateLimitBucket,
  PeriodUsage,
  ResetOutcome,
  Settings,
  UsageSnapshot,
  WindowUsage,
} from '../types';
import {
  buildPeriodUsage,
  clamp,
  computeSpend,
  EMPTY_WINDOW,
  enrichWithCosts,
  mergeModelMap,
  parseCodexUsage,
  parseJson,
  parseLocalLimitWindow,
  parseRolloutFile,
  parseWhamResponse,
} from './usageLogic';

const SETTINGS_KEY = 'settings';
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/api/codex/usage';
const WHAM_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_RESET_CREDIT_URL = 'https://chatgpt.com/backend-api/api/codex/rate-limit-reset-credits/consume';
const WHAM_RESET_CREDIT_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume';
const AUTOSTART_ID = 'codex-ui.desktop';

const DEFAULT_SETTINGS: Settings = {
  refresh_interval_secs: 60,
  autostart: false,
  notify_at_90_pct: true,
};

const EMPTY_PERIOD: PeriodUsage = {
  messages: 0,
  tokens: 0,
  models: [],
};

type Auth = { kind: 'bearer'; accessToken: string; accountId?: string };

type CodexAuthResult =
  | { ok: true; auth: Auth & { kind: 'bearer' }; path: string }
  | { ok: false; path?: string; reason: string };

let cached: { snapshot: UsageSnapshot; at: number } | null = null;
let refreshInFlight: Promise<UsageSnapshot> | null = null;
let quotaAlertActive = false;
let refreshTimer: number | null = null;
const listeners = new Set<(snapshot: UsageSnapshot) => void>();
const rolloutCache = new Map<string, {
  modifiedAt: number;
  size: number;
  parsed: ReturnType<typeof parseRolloutFile>;
}>();

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function nativeApi(): NeutralinoApi | null {
  return window.Neutralino ?? (typeof Neutralino !== 'undefined' ? Neutralino : null);
}

export function initNeutralinoBackend() {
  const api = nativeApi();
  if (!api) return;

  try {
    api.init();
  } catch {
    // Neutralino throws if initialized twice.
  }

  api.events.on('trayMenuItemClicked', (event) => {
    const detail = record(event.detail);
    if (detail.id === 'quit') {
      void quitApp();
    }
    if (detail.id === 'refresh') {
      void refreshUsage();
    }
  });

  api.events.on('trayIconClicked', () => {
    void api.window.show();
    void api.window.focus();
    void refreshUsage();
  });

  void api.window.show();
  void api.window.focus();
  void configureTray(0, 0);
  void scheduleRefresh();
}

export function onUsageUpdated(listener: (snapshot: UsageSnapshot) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getUsage(): Promise<UsageSnapshot> {
  if (cached && Date.now() - cached.at < 55_000) {
    return cached.snapshot;
  }
  const localSnapshot = await fetchSnapshot(false);
  cached = { snapshot: localSnapshot, at: Date.now() };
  await afterSnapshot(localSnapshot);
  void refreshUsage();
  return localSnapshot;
}

export async function refreshUsage(): Promise<UsageSnapshot> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const snapshot = await fetchSnapshot();
    cached = { snapshot, at: Date.now() };
    await afterSnapshot(snapshot);
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function executeReset(creditId?: string): Promise<ResetOutcome> {
  let outcome: ResetOutcome = 'failed';
  try {
    const response = record(await callCodexAppServer('account/rateLimitResetCredit/consume', {
      idempotencyKey: createIdempotencyKey(),
      creditId: creditId ?? null,
    }));
    outcome = parseResetOutcome(response.outcome);
  } catch {
    const auth = await loadCodexAuth();
    if (auth.ok) outcome = await consumeResetCredit(auth.auth, creditId);
  }

  if (outcome === 'reset' || outcome === 'alreadyRedeemed') {
    await incrementResetCount();
    await refreshUsage();
  }

  return outcome;
}

export async function checkFirstLaunch(): Promise<boolean> {
  return !(await loadCodexAuth()).ok;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const codex = await loadCodexAuth();
  if (codex.ok) {
    return {
      source: 'codex',
      account_id: codex.auth.accountId,
      auth_path: codex.path,
      message: codex.auth.accountId
        ? `已自动读取 Codex 登录态：${codex.auth.accountId}`
        : '已自动读取 Codex 登录态',
    };
  }

  return {
    source: 'none',
    auth_path: codex.path,
    message: codex.reason,
  };
}

export async function loadSettings(): Promise<Settings> {
  const api = nativeApi();
  if (!api) return { ...DEFAULT_SETTINGS };

  try {
    const raw = await api.storage.getData(SETTINGS_KEY);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      refresh_interval_secs: clamp(Number(parsed.refresh_interval_secs ?? 60), 30, 300),
      autostart: !!parsed.autostart,
      notify_at_90_pct: parsed.notify_at_90_pct ?? true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const normalized: Settings = {
    refresh_interval_secs: clamp(Number(settings.refresh_interval_secs), 30, 300),
    autostart: !!settings.autostart,
    notify_at_90_pct: !!settings.notify_at_90_pct,
  };

  const api = nativeApi();

  if (api) {
    await applyAutostart(normalized.autostart);
    await api.storage.setData(SETTINGS_KEY, JSON.stringify(normalized));
  }

  cached = null;
  await scheduleRefresh();
}

async function applyAutostart(enabled: boolean): Promise<void> {
  const api = nativeApi();
  if (!api) return;
  if (typeof NL_OS !== 'undefined' && NL_OS !== 'Linux') {
    throw new Error('开机自启当前仅支持 Linux。');
  }

  const home = await api.os.getPath('home');
  const autostartDir = `${home}/.config/autostart`;
  const desktopPath = `${autostartDir}/${AUTOSTART_ID}`;

  if (!enabled) {
    try {
      await api.filesystem.removeFile(desktopPath);
    } catch {
      // Missing autostart entries are already disabled.
    }
    return;
  }

  const executable = await currentExecutablePath();
  if (!executable.includes('/neutralino-dist/')) {
    throw new Error('请先运行 ./run.sh --build，并在发布版中开启开机自启。');
  }

  try {
    await api.filesystem.createDirectory(`${home}/.config`);
  } catch {
    // Directory already exists or cannot be created; the next write reports real failures.
  }
  try {
    await api.filesystem.createDirectory(autostartDir);
  } catch {
    // Directory already exists or cannot be created; the next write reports real failures.
  }

  await api.filesystem.writeFile(desktopPath, [
    '[Desktop Entry]',
    'Type=Application',
    'Name=codex-ui',
    'Comment=Codex usage dashboard',
    `Exec=${desktopExecQuote(executable)}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n'));
}

async function currentExecutablePath(): Promise<string> {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino API unavailable');

  const out = await api.os.execCommand('readlink -f /proc/$PPID/exe');
  const executable = out.stdOut.trim();
  if (out.exitCode !== 0 || !executable) {
    throw new Error(out.stdErr || '无法定位当前程序路径');
  }
  return executable;
}

export async function hideWindow(): Promise<void> {
  const api = nativeApi();
  if (!api) return;
  try {
    await api.window.hide();
  } catch {
    await api.window.minimize();
  }
}

export async function quitApp(): Promise<void> {
  await nativeApi()?.app.exit();
}

async function fetchSnapshot(includeRemote = true): Promise<UsageSnapshot> {
  const now = new Date();
  let error: string | undefined;
  let error_kind: string | undefined;
  let provider = 'local-session';

  const localUsage = await parseLocalUsage();
  const today_local = enrichWithCosts(localUsage.today);
  const month_local = enrichWithCosts(localUsage.month);
  const spend = computeSpend(month_local);

  let window_5h: WindowUsage = { ...EMPTY_WINDOW };
  let window_weekly: WindowUsage = { ...EMPTY_WINDOW };
  let rate_limits: RateLimitBucket[] = [];
  let banked_resets: BankedResets = {
    available: null,
    credits: [],
    lifetime_used: await getResetCount(),
    last_reset_at: await getLastResetAt(),
  };

  if (includeRemote) try {
    let remote: Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'>;
    try {
      remote = parseCodexUsage(await callCodexAppServer('account/rateLimits/read', {}))
        ?? (() => { throw new Error('PARSE_ERROR: Codex app-server 未返回可识别的额度'); })();
      provider = 'codex-app-server';
    } catch (appServerError) {
      const auth = await loadCodexAuth();
      if (!auth.ok) throw new Error(`NO_AUTH: ${auth.reason}`);
      remote = await fetchWhamUsage(auth.auth);
      provider = 'codex-http';
      if (!remote.rate_limits.length) throw appServerError;
    }
    window_5h = remote.window_5h;
    window_weekly = remote.window_weekly;
    rate_limits = remote.rate_limits;
    banked_resets = {
      ...remote.banked_resets,
      lifetime_used: await getResetCount(),
      last_reset_at: await getLastResetAt(),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    error = message.replace(/^(NO_AUTH|PARSE_ERROR):\s*/, '');
    if (message.startsWith('NO_AUTH:')) error_kind = 'NO_AUTH';
    else if (message.startsWith('PARSE_ERROR:')) error_kind = 'PARSE_ERROR';
    else if (message.includes('401') || message.includes('403')) error_kind = 'COOKIE_EXPIRED';
    else error_kind = 'NETWORK_ERROR';
  }

  const localLimits = await parseLatestRateLimits();
  if (localLimits) {
    if (localLimits.primary.percent > 0 && (window_5h.limit === 0 || window_5h.percent === 0)) {
      window_5h = localLimits.primary;
    }
    if (localLimits.secondary.percent > 0 && (window_weekly.limit === 0 || window_weekly.percent === 0)) {
      window_weekly = localLimits.secondary;
    }
    if (!rate_limits.length && (window_5h.limit > 0 || window_weekly.limit > 0)) {
      rate_limits = [{
        id: 'codex',
        name: null,
        primary: window_5h,
        secondary: window_weekly,
        plan_type: null,
      }];
    }
  }

  return {
    fetched_at: now.toISOString(),
    provider,
    window_5h,
    window_weekly,
    rate_limits,
    today_local,
    month_local,
    banked_resets,
    spend,
    error,
    error_kind,
  };
}

async function afterSnapshot(snapshot: UsageSnapshot) {
  const settings = await loadSettings();
  await configureTray(snapshot.window_5h.percent, snapshot.banked_resets.available ?? 0);

  const shouldNotify =
    settings.notify_at_90_pct &&
    !snapshot.error_kind &&
    snapshot.window_5h.percent >= 90 &&
    !quotaAlertActive;

  if (snapshot.window_5h.percent < 85 || snapshot.error_kind) {
    quotaAlertActive = false;
  } else if (shouldNotify) {
    quotaAlertActive = true;
  }

  if (shouldNotify) {
    await nativeApi()?.os.showNotification('Codex 用量提醒', `5 小时窗口已使用 ${snapshot.window_5h.percent.toFixed(0)}%`, 'WARNING');
  }
}

async function configureTray(percent: number, resets: number) {
  const api = nativeApi();
  if (!api) return;
  try {
    await api.os.setTray({
      icon: '/icons/tray.png',
      menuItems: [
        { id: 'status', text: `5h ${percent.toFixed(0)}% · reset ${resets}`, isDisabled: true },
        { id: 'refresh', text: '刷新' },
        { text: '-' },
        { id: 'quit', text: '退出' },
      ],
    });
  } catch (e) {
    console.warn('Tray setup failed; continuing with normal window mode.', e);
  }
}

async function scheduleRefresh() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const settings = await loadSettings();
  refreshTimer = window.setInterval(() => {
    void refreshUsage();
  }, clamp(settings.refresh_interval_secs, 30, 300) * 1000);
}

async function loadCodexAuth(): Promise<CodexAuthResult> {
  const api = nativeApi();
  if (!api) {
    return { ok: false, reason: 'Neutralino 运行时不可用，无法读取本机 Codex 登录态' };
  }

  let path: string | undefined;
  try {
    const home = await api.os.getPath('home');
    path = `${home}/.codex/auth.json`;
    const raw = await api.filesystem.readFile(path);
    const parsed = JSON.parse(raw);
    const accessToken =
      parsed?.tokens?.access_token ??
      parsed?.tokens?.accessToken ??
      parsed?.access_token ??
      parsed?.accessToken;
    if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
      return { ok: false, path, reason: 'Codex 登录文件存在，但没有可用 access token，请重新运行 codex login' };
    }
    const accountId = parsed?.tokens?.account_id;
    return {
      ok: true,
      path,
      auth: {
        kind: 'bearer',
        accessToken,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId : undefined,
      },
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      path,
      reason: path
        ? `未检测到 Codex 登录态：${path}。请先运行 codex login`
        : `无法定位 Codex 登录态：${reason}`,
    };
  }
}

async function fetchWhamUsage(auth: Auth): Promise<Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'>> {
  const codex = await curlJson(CODEX_USAGE_URL, auth, 'GET');
  if (codex.ok) {
    const parsed = parseCodexUsage(codex.json);
    if (parsed) return parsed;
    throw new Error('PARSE_ERROR: Codex usage 响应格式无法识别');
  }
  if (codex.status !== 404) {
    throw new Error(`usage 返回 HTTP ${codex.status}`);
  }

  const wham = await curlJson(WHAM_USAGE_URL, auth, 'GET');
  if (!wham.ok) {
    throw new Error(`usage 返回 HTTP ${wham.status}`);
  }
  return parseWhamResponse(wham.json);
}

async function callCodexAppServer(method: string, params: unknown): Promise<unknown> {
  const api = nativeApi();
  if (!api) throw new Error('Codex app-server 需要 Neutralino 运行时');

  const request = JSON.stringify({ method, id: 2, params });
  const bridge = `
const { spawn } = require('node:child_process');
const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let stderr = '';
let settled = false;
const timer = setTimeout(() => finish(1, 'Codex app-server 请求超时'), 30000);
function send(value) { child.stdin.write(JSON.stringify(value) + '\\n'); }
function finish(code, message) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (message) (code === 0 ? process.stdout : process.stderr).write(message);
  child.kill();
  setTimeout(() => process.exit(code), 50);
}
child.on('error', error => finish(1, error.message));
child.stderr.on('data', chunk => { stderr += chunk; });
child.stdout.on('data', chunk => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id === 1) {
      send({ method: 'initialized', params: {} });
      send(${request});
    } else if (message.id === 2) {
      if (message.error) finish(1, JSON.stringify(message.error));
      else finish(0, JSON.stringify(message.result));
    }
  }
});
child.on('exit', code => {
  if (!settled) finish(1, stderr || 'Codex app-server 提前退出：' + code);
});
send({
  method: 'initialize',
  id: 1,
  params: {
    clientInfo: { name: 'codex-ui', title: 'Codex UI', version: '0.1.0' },
    capabilities: null,
  },
});`;

  const out = await api.os.execCommand(`node -e ${shellQuote(bridge)}`);
  if (out.exitCode !== 0 || !out.stdOut.trim()) {
    throw new Error(out.stdErr.trim() || 'Codex app-server 调用失败');
  }
  try {
    return JSON.parse(out.stdOut);
  } catch {
    throw new Error('PARSE_ERROR: Codex app-server 返回了无效 JSON');
  }
}

async function consumeResetCredit(auth: Auth, creditId?: string): Promise<ResetOutcome> {
  const idempotencyKey = createIdempotencyKey();
  const urls = [CODEX_RESET_CREDIT_URL, WHAM_RESET_CREDIT_URL];
  const bodies = [
    { idempotencyKey, creditId },
    { idempotency_key: idempotencyKey, credit_id: creditId },
  ];

  for (const url of urls) {
    for (const body of bodies) {
      try {
        const result = await curlJson(url, auth, 'POST', body);
        if (!result.ok) continue;
        const outcome = parseResetOutcome(record(result.json).outcome);
        if (outcome !== 'failed') return outcome;
      } catch {
        // Try the next supported endpoint/body shape.
      }
    }
  }

  return 'failed';
}

function parseResetOutcome(value: unknown): ResetOutcome {
  return value === 'reset' || value === 'nothingToReset' || value === 'noCredit' || value === 'alreadyRedeemed'
    ? value
    : 'failed';
}

async function curlJson(url: string, auth: Auth, method: 'GET' | 'POST', requestBody?: unknown): Promise<{ ok: boolean; status: number; json: unknown }> {
  const api = nativeApi();
  if (!api) {
    throw new Error('Neutralino API unavailable');
  }

  const headers = [
    `header = ${curlConfigQuote(`Authorization: Bearer ${auth.accessToken}`)}`,
    `header = ${curlConfigQuote('OAI-Product-Sku: codex')}`,
    auth.accountId ? `header = ${curlConfigQuote(`ChatGPT-Account-Id: ${auth.accountId}`)}` : '',
  ];
  const config = [
    `url = ${curlConfigQuote(url)}`,
    method === 'POST' ? 'request = "POST"' : '',
    'location',
    'silent',
    'show-error',
    'max-time = 12',
    'write-out = "\\n%{http_code}"',
    'header = "accept: application/json"',
    'header = "referer: https://chatgpt.com/"',
    'header = "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"',
    requestBody ? 'header = "content-type: application/json"' : '',
    requestBody ? `data = ${curlConfigQuote(JSON.stringify(requestBody))}` : '',
    ...headers,
  ].filter(Boolean).join('\n');

  const out = await api.os.execCommand('curl -K -', { stdIn: config });
  const responseText = out.stdOut.trimEnd();
  const splitAt = responseText.lastIndexOf('\n');
  const payload = splitAt >= 0 ? responseText.slice(0, splitAt) : responseText;
  const status = splitAt >= 0 ? Number(responseText.slice(splitAt + 1)) : out.exitCode === 0 ? 200 : 0;

  if (status === 401 || status === 403) {
    throw new Error(`鉴权失败（${status}）`);
  }
  if (out.exitCode !== 0 && status === 0) {
    throw new Error(out.stdErr || 'curl 请求失败');
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    json: payload ? JSON.parse(payload) : null,
  };
}

async function parseLocalUsage(): Promise<{ today: PeriodUsage; month: PeriodUsage }> {
  const api = nativeApi();
  if (!api) return { today: { ...EMPTY_PERIOD }, month: { ...EMPTY_PERIOD } };

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthMap = new Map<string, { input: number; cached: number; output: number }>();
  const todayMap = new Map<string, { input: number; cached: number; output: number }>();
  let monthMessages = 0;
  let monthTokens = 0;
  let todayMessages = 0;
  let todayTokens = 0;
  const activeFiles = new Set<string>();

  for (const day of daysBetween(from, today)) {
    const isToday = day.getFullYear() === today.getFullYear()
      && day.getMonth() === today.getMonth()
      && day.getDate() === today.getDate();
    for (const file of await rolloutFilesForDay(day)) {
      activeFiles.add(file);
      try {
        const stats = await api.filesystem.getStats(file);
        const cachedFile = rolloutCache.get(file);
        let parsed: ReturnType<typeof parseRolloutFile>;
        if (!cachedFile || cachedFile.modifiedAt !== stats.modifiedAt || cachedFile.size !== stats.size) {
          parsed = parseRolloutFile(await api.filesystem.readFile(file));
          rolloutCache.set(file, { modifiedAt: stats.modifiedAt, size: stats.size, parsed });
        } else {
          parsed = cachedFile.parsed;
        }
        monthMessages += parsed.messages;
        monthTokens += parsed.tokens;
        mergeModelMap(monthMap, parsed.modelMap);
        if (isToday) {
          todayMessages += parsed.messages;
          todayTokens += parsed.tokens;
          mergeModelMap(todayMap, parsed.modelMap);
        }
      } catch {
        // Ignore unreadable/in-progress session files.
      }
    }
  }

  for (const file of rolloutCache.keys()) {
    if (!activeFiles.has(file)) rolloutCache.delete(file);
  }

  return {
    today: buildPeriodUsage(todayMessages, todayTokens, todayMap),
    month: buildPeriodUsage(monthMessages, monthTokens, monthMap),
  };
}

async function parseLatestRateLimits(): Promise<{ primary: WindowUsage; secondary: WindowUsage } | null> {
  const api = nativeApi();
  if (!api) return null;

  try {
    const home = await api.os.getPath('home');
    let latest: { timestamp: number; primary: WindowUsage; secondary: WindowUsage } | null = null;

    for (const day of recentDays(14)) {
      for (const path of await rolloutFilesForDay(day, home)) {
        latest = await latestRateLimitsInFile(path, latest);
      }
      if (latest) break;
    }

    return latest ? { primary: latest.primary, secondary: latest.secondary } : null;
  } catch {
    return null;
  }
}

async function latestRateLimitsInFile(
  path: string,
  latest: { timestamp: number; primary: WindowUsage; secondary: WindowUsage } | null,
) {
  const api = nativeApi();
  if (!api) return latest;

  try {
    const content = await api.filesystem.readFile(path);
    for (const line of content.split('\n')) {
      const parsed = parseJson(line);
      const parsedRecord = record(parsed);
      const payload = record(parsedRecord.payload);
      const rateLimits = record(payload.rate_limits);
      if (payload.type !== 'token_count' || !payload.rate_limits) continue;
      const primary = parseLocalLimitWindow(rateLimits.primary);
      const secondary = parseLocalLimitWindow(rateLimits.secondary);
      if (!primary || !secondary) continue;
      const ts = Date.parse(String(parsedRecord.timestamp ?? payload.timestamp ?? '')) || Date.now();
      if (!latest || ts > latest.timestamp) {
        latest = { timestamp: ts, primary, secondary };
      }
    }
  } catch {
    return latest;
  }

  return latest;
}

async function rolloutFilesForDay(day: Date, homeOverride?: string): Promise<string[]> {
  const api = nativeApi();
  if (!api) return [];
  try {
    const home = homeOverride ?? await api.os.getPath('home');
    const y = String(day.getFullYear()).padStart(4, '0');
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const dir = `${home}/.codex/sessions/${y}/${m}/${d}`;
    const entries = await api.filesystem.readDirectory(dir);
    return entries
      .filter((entry) => entry.type === 'FILE' && entry.entry.startsWith('rollout-') && entry.entry.endsWith('.jsonl'))
      .map((entry) => `${dir}/${entry.entry}`);
  } catch {
    return [];
  }
}

function* recentDays(count: number): Generator<Date> {
  const day = new Date();
  for (let i = 0; i < count; i += 1) {
    yield new Date(day);
    day.setDate(day.getDate() - 1);
  }
}

async function getResetCount(): Promise<number> {
  const raw = await storageRecord<{ lifetime_reset_count?: number }>('reset_state', {});
  return Number(raw.lifetime_reset_count ?? 0);
}

async function getLastResetAt(): Promise<string | null> {
  const raw = await storageRecord<{ last_reset_at?: string }>('reset_state', {});
  return raw.last_reset_at ?? null;
}

async function incrementResetCount() {
  const current = await storageRecord<{ lifetime_reset_count?: number; last_reset_at?: string }>('reset_state', {});
  await nativeApi()?.storage.setData('reset_state', JSON.stringify({
    lifetime_reset_count: Number(current.lifetime_reset_count ?? 0) + 1,
    last_reset_at: new Date().toISOString(),
  }));
}

async function storageRecord<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await nativeApi()?.storage.getData(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function* daysBetween(from: Date, to: Date): Generator<Date> {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (day <= end) {
    yield new Date(day);
    day.setDate(day.getDate() + 1);
  }
}

function curlConfigQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

function createIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function desktopExecQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
