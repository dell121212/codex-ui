import type {
  AuthStatus,
  BankedResets,
  PeriodUsage,
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
const WHAM_RESET_URL = 'https://chatgpt.com/backend-api/wham/reset';

const DEFAULT_SETTINGS: Settings = {
  chatgpt_cookie: undefined,
  refresh_interval_secs: 60,
  autostart: false,
  notify_at_90_pct: true,
};

const EMPTY_PERIOD: PeriodUsage = {
  messages: 0,
  tokens: 0,
  models: [],
};

type Auth =
  | { kind: 'bearer'; accessToken: string; accountId?: string }
  | { kind: 'cookie'; cookie: string };

type CodexAuthResult =
  | { ok: true; auth: Auth & { kind: 'bearer' }; path: string }
  | { ok: false; path?: string; reason: string };

let cached: { snapshot: UsageSnapshot; at: number } | null = null;
let quotaAlertActive = false;
let refreshTimer: number | null = null;
const listeners = new Set<(snapshot: UsageSnapshot) => void>();

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
    if (event.detail?.id === 'quit') {
      void quitApp();
    }
    if (event.detail?.id === 'refresh') {
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
  return refreshUsage();
}

export async function refreshUsage(): Promise<UsageSnapshot> {
  const snapshot = await fetchSnapshot();
  cached = { snapshot, at: Date.now() };
  await afterSnapshot(snapshot);
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export async function executeReset(): Promise<boolean> {
  const settings = await loadSettings();
  const auth = await resolveAuth(settings);

  let ok = false;
  if (auth) {
    try {
      const result = await curlJson(WHAM_RESET_URL, auth, 'POST');
      ok = result.ok;
    } catch {
      ok = false;
    }
  }

  if (!ok) {
    const api = nativeApi();
    if (api) {
      try {
        const out = await api.os.execCommand('codex /reset');
        const text = `${out.stdOut}\n${out.stdErr}`.toLowerCase();
        ok = out.exitCode === 0 || text.includes('reset');
      } catch {
        ok = false;
      }
    }
  }

  if (ok) {
    await incrementResetCount();
    await refreshUsage();
  }

  return ok;
}

export async function testConnection(cookie: string): Promise<boolean> {
  try {
    const result = await fetchWhamUsage({ kind: 'cookie', cookie });
    return !!result;
  } catch {
    return false;
  }
}

export async function checkFirstLaunch(): Promise<boolean> {
  const settings = await loadSettings();
  return !(await resolveAuth(settings));
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

  const settings = await loadSettings();
  if (settings.chatgpt_cookie?.trim()) {
    return {
      source: 'cookie',
      auth_path: codex.path,
      message: '未找到 Codex token，当前使用备用 Cookie',
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
    chatgpt_cookie: settings.chatgpt_cookie?.trim() || undefined,
    refresh_interval_secs: clamp(Number(settings.refresh_interval_secs), 30, 300),
    autostart: !!settings.autostart,
    notify_at_90_pct: !!settings.notify_at_90_pct,
  };

  const api = nativeApi();
  if (api) {
    if (normalized.autostart) {
      throw new Error('Neutralino 版暂未自动写入开机自启，请使用系统“启动应用”添加发布版程序。');
    }
    await api.storage.setData(SETTINGS_KEY, JSON.stringify(normalized));
  }

  cached = null;
  await scheduleRefresh();
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

async function fetchSnapshot(): Promise<UsageSnapshot> {
  const settings = await loadSettings();
  const now = new Date();
  let error: string | undefined;
  let error_kind: string | undefined;

  const today_local = enrichWithCosts(await parsePeriodUsage('today'));
  const month_local = enrichWithCosts(await parsePeriodUsage('month'));
  const spend = computeSpend(month_local);

  let window_5h: WindowUsage = { ...EMPTY_WINDOW };
  let window_weekly: WindowUsage = { ...EMPTY_WINDOW };
  let banked_resets: BankedResets = {
    available: null,
    lifetime_used: await getResetCount(),
    last_reset_at: await getLastResetAt(),
  };

  const auth = await resolveAuth(settings);
  if (auth) {
    try {
      const remote = await fetchWhamUsage(auth);
      window_5h = remote.window_5h;
      window_weekly = remote.window_weekly;
      banked_resets = {
        ...remote.banked_resets,
        lifetime_used: await getResetCount(),
        last_reset_at: await getLastResetAt(),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      error = message;
      error_kind = message.includes('401') || message.includes('403') ? 'COOKIE_EXPIRED' : 'NETWORK_ERROR';
    }
  } else {
    error = '未检测到 Codex 登录态，仅显示本地数据';
    error_kind = 'NO_AUTH';
  }

  const localLimits = await parseLatestRateLimits();
  if (localLimits) {
    if (localLimits.primary.percent > 0 && (window_5h.limit === 0 || window_5h.percent === 0)) {
      window_5h = localLimits.primary;
    }
    if (localLimits.secondary.percent > 0 && (window_weekly.limit === 0 || window_weekly.percent === 0)) {
      window_weekly = localLimits.secondary;
    }
    if (window_5h.percent > 0 || window_weekly.percent > 0) {
      error = undefined;
      error_kind = undefined;
    }
  }

  return {
    fetched_at: now.toISOString(),
    provider: 'codex',
    window_5h,
    window_weekly,
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

async function resolveAuth(settings: Settings): Promise<Auth | null> {
  const codexAuth = await loadCodexAuth();
  if (codexAuth.ok) return codexAuth.auth;
  const cookie = settings.chatgpt_cookie?.trim();
  return cookie ? { kind: 'cookie', cookie } : null;
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

async function fetchWhamUsage(auth: Auth): Promise<Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'banked_resets'>> {
  if (auth.kind === 'bearer') {
    try {
      const codex = await curlJson(CODEX_USAGE_URL, auth, 'GET');
      if (codex.ok) {
        const parsed = parseCodexUsage(codex.json);
        if (parsed) return parsed;
      }
    } catch {
      // Fall through to legacy wham endpoint.
    }
  }

  const wham = await curlJson(WHAM_USAGE_URL, auth, 'GET');
  if (!wham.ok) {
    throw new Error(`usage 返回 HTTP ${wham.status}`);
  }
  return parseWhamResponse(wham.json);
}

async function curlJson(url: string, auth: Auth, method: 'GET' | 'POST'): Promise<{ ok: boolean; status: number; json: any }> {
  const api = nativeApi();
  if (!api) {
    throw new Error('Neutralino API unavailable');
  }

  const headers = auth.kind === 'bearer'
    ? [
        `-H ${shellQuote(`Authorization: Bearer ${auth.accessToken}`)}`,
        '-H "OAI-Product-Sku: codex"',
        auth.accountId ? `-H ${shellQuote(`ChatGPT-Account-Id: ${auth.accountId}`)}` : '',
      ]
    : [`-H ${shellQuote(`Cookie: ${auth.cookie}`)}`];

  const command = [
    'curl',
    '-sS',
    '-L',
    '-m 12',
    '-w "\\n%{http_code}"',
    method === 'POST' ? '-X POST' : '',
    '-H "accept: application/json"',
    '-H "referer: https://chatgpt.com/"',
    '-H "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"',
    ...headers,
    shellQuote(url),
  ].filter(Boolean).join(' ');

  const out = await api.os.execCommand(command);
  const body = out.stdOut.trimEnd();
  const splitAt = body.lastIndexOf('\n');
  const payload = splitAt >= 0 ? body.slice(0, splitAt) : body;
  const status = splitAt >= 0 ? Number(body.slice(splitAt + 1)) : out.exitCode === 0 ? 200 : 0;

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

async function parsePeriodUsage(period: 'today' | 'month'): Promise<PeriodUsage> {
  const api = nativeApi();
  if (!api) return { ...EMPTY_PERIOD };

  const today = new Date();
  const from = period === 'today' ? today : new Date(today.getFullYear(), today.getMonth(), 1);
  const modelMap = new Map<string, { input: number; cached: number; output: number }>();
  let messages = 0;
  let tokens = 0;

  for (const day of daysBetween(from, today)) {
    for (const file of await rolloutFilesForDay(day)) {
      try {
        const content = await api.filesystem.readFile(file);
        const parsed = parseRolloutFile(content);
        messages += parsed.messages;
        tokens += parsed.tokens;
        mergeModelMap(modelMap, parsed.modelMap);
      } catch {
        // Ignore unreadable/in-progress session files.
      }
    }
  }

  return buildPeriodUsage(messages, tokens, modelMap);
}

async function parseLatestRateLimits(): Promise<{ primary: WindowUsage; secondary: WindowUsage } | null> {
  const api = nativeApi();
  if (!api) return null;

  try {
    const home = await api.os.getPath('home');
    const root = `${home}/.codex/sessions`;
    const entries = await api.filesystem.readDirectory(root, { recursive: true });
    let latest: { timestamp: number; primary: WindowUsage; secondary: WindowUsage } | null = null;

    for (const entry of entries) {
      if (entry.type !== 'FILE' || !entry.entry.endsWith('.jsonl') || !entry.entry.includes('rollout-')) continue;
      const path = `${root}/${entry.entry}`;
      const content = await api.filesystem.readFile(path);
      for (const line of content.split('\n')) {
        const parsed = parseJson(line);
        const payload = parsed?.payload;
        if (payload?.type !== 'token_count' || !payload?.rate_limits) continue;
        const primary = parseLocalLimitWindow(payload.rate_limits.primary);
        const secondary = parseLocalLimitWindow(payload.rate_limits.secondary);
        if (!primary || !secondary) continue;
        const ts = Date.parse(parsed.timestamp ?? payload.timestamp ?? '') || Date.now();
        if (!latest || ts > latest.timestamp) {
          latest = { timestamp: ts, primary, secondary };
        }
      }
    }

    return latest ? { primary: latest.primary, secondary: latest.secondary } : null;
  } catch {
    return null;
  }
}

async function rolloutFilesForDay(day: Date): Promise<string[]> {
  const api = nativeApi();
  if (!api) return [];
  try {
    const home = await api.os.getPath('home');
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
