import type {
  AuthStatus,
  BankedResets,
  RateLimitBucket,
  ProviderLocalUsage,
  ResetOutcome,
  Settings,
  UsageSnapshot,
  WindowUsage,
} from '../types';
import {
  clamp,
  coalesceWindow,
  computeSpend,
  EMPTY_WINDOW,
  isWindowMissing,
  mostConstrainedCodexWindow,
  normalizeCodexWindows,
  parseCodexUsage,
  parseJson,
  parseLocalLimitWindow,
  parseWhamResponse,
} from './usageLogic';
import {
  buildMistralTokenQuota,
  captureAllLocalProviders,
  EMPTY_PERIOD as EMPTY_LOCAL_PERIOD,
  extractMistralApiKey,
  loadGrokAccessToken,
  parseGrokBillingResponses,
  parseMistralAdminLimits,
  parseMistralRateLimitHeaders,
  parseVibeActiveModel,
  parseVibeWhoAmI,
} from './localProviders';

const SETTINGS_KEY = 'settings';
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/api/codex/usage';
const WHAM_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_RESET_CREDIT_URL = 'https://chatgpt.com/backend-api/api/codex/rate-limit-reset-credits/consume';
const WHAM_RESET_CREDIT_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume';
const GROK_BILLING_CREDITS_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits';
const GROK_BILLING_MONTHLY_URL = 'https://cli-chat-proxy.grok.com/v1/billing';
const MISTRAL_VIBE_WHOAMI_URL = 'https://chat.mistral.ai/api/vibe/whoami';
const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_ADMIN_SPEND_URL = 'https://console.mistral.ai/api/admin/spend-limit';
const MISTRAL_ADMIN_RATE_URL = 'https://console.mistral.ai/api/admin/rate-limit';
const AUTOSTART_ID = 'codex-ui.desktop';

const DEFAULT_SETTINGS: Settings = {
  refresh_interval_secs: 60,
  autostart: false,
  notify_at_90_pct: true,
};

type Auth = { kind: 'bearer'; accessToken: string; accountId?: string };

type CodexAuthResult =
  | { ok: true; auth: Auth & { kind: 'bearer' }; path: string }
  | { ok: false; path?: string; reason: string };

/** In-memory snapshot cache. `at` = last successful remote-inclusive refresh. */
let cached: { snapshot: UsageSnapshot; at: number } | null = null;
let refreshInFlight: Promise<UsageSnapshot> | null = null;
let quotaAlertActive = false;
let refreshTimer: number | null = null;
const listeners = new Set<(snapshot: UsageSnapshot) => void>();

/** Serve memory cache as fresh for this long (matches default refresh cadence). */
const FRESH_MS = 55_000;
/** Disk SWR: still paint immediately, revalidate in background. */
const DISK_CACHE_KEY = 'usage_cache_v1';
/** Mistral chat rate-limit probe is expensive — reuse for 10 minutes. */
const MISTRAL_PROBE_TTL_MS = 10 * 60 * 1000;
let mistralProbeCache: {
  at: number;
  model: string;
  limits: ReturnType<typeof parseMistralRateLimitHeaders>;
} | null = null;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function nativeApi(): NeutralinoApi | null {
  return window.Neutralino ?? (typeof Neutralino !== 'undefined' ? Neutralino : null);
}

function publishSnapshot(snapshot: UsageSnapshot) {
  listeners.forEach((listener) => listener(snapshot));
}

function isCacheFresh(at: number): boolean {
  return Date.now() - at < FRESH_MS;
}

async function loadDiskCache(): Promise<{ snapshot: UsageSnapshot; at: number } | null> {
  try {
    const raw = await nativeApi()?.storage.getData(DISK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: UsageSnapshot; at?: number };
    if (!parsed?.snapshot || typeof parsed.snapshot !== 'object') return null;
    const at = typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : 0;
    return { snapshot: parsed.snapshot, at };
  } catch {
    return null;
  }
}

async function saveDiskCache(snapshot: UsageSnapshot, at: number): Promise<void> {
  try {
    await nativeApi()?.storage.setData(DISK_CACHE_KEY, JSON.stringify({ snapshot, at }));
  } catch {
    // best-effort; ignore storage failures
  }
}

/** Hydrate memory cache from disk once so first paint is instant after restart. */
async function ensureMemoryCache(): Promise<void> {
  if (cached) return;
  const disk = await loadDiskCache();
  if (disk) cached = disk;
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
    // Don't force a full network round-trip when cache is still fresh.
    if (!cached || !isCacheFresh(cached.at)) {
      void refreshUsage();
    }
  });

  void api.window.show();
  void api.window.focus();
  void configureTray(0, 0, '额度');
  // Warm disk cache into memory as early as possible (non-blocking).
  void ensureMemoryCache().then(() => {
    if (cached) publishSnapshot(cached.snapshot);
  });
  void scheduleRefresh();
}

export function onUsageUpdated(listener: (snapshot: UsageSnapshot) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getUsage(): Promise<UsageSnapshot> {
  await ensureMemoryCache();

  // Fresh enough — serve memory cache.
  if (cached && isCacheFresh(cached.at)) {
    return cached.snapshot;
  }
  // Stale-while-revalidate: paint last good snapshot, refresh in background.
  if (cached) {
    void refreshUsage();
    return cached.snapshot;
  }
  return refreshUsage();
}

/**
 * Two-phase refresh:
 * 1) Local scan + previous remote merge → instant UI update
 * 2) Parallel Codex / Grok / Mistral remote → final snapshot + disk cache
 */
export async function refreshUsage(): Promise<UsageSnapshot> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    await ensureMemoryCache();
    const previous = cached?.snapshot ?? null;

    // Phase A — local only (no network). Merge last remote windows so bars don't flash empty.
    const localSnap = await fetchSnapshot(false, previous);
    cached = {
      snapshot: localSnap,
      // Keep previous freshness so concurrent getUsage still SWR-refreshes if needed.
      at: cached?.at ?? 0,
    };
    publishSnapshot(localSnap);

    // Phase B — full remote (parallel inside fetchSnapshot).
    const snapshot = await fetchSnapshot(true, localSnap);
    const now = Date.now();
    cached = { snapshot, at: now };
    void saveDiskCache(snapshot, now);
    await afterSnapshot(snapshot);
    publishSnapshot(snapshot);
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

export async function quitApp(): Promise<void> {
  await nativeApi()?.app.exit();
}

async function fetchSnapshot(
  includeRemote = true,
  previous: UsageSnapshot | null = null,
): Promise<UsageSnapshot> {
  const now = new Date();
  let error: string | undefined;
  let error_kind: string | undefined;
  let provider = previous?.provider ?? 'local-session';
  let remoteLimitsOk = false;

  // Local filesystem capture first (no network).
  const localOnly = await captureLocalProvidersOnly();
  // Phase A: reattach last known remote quota so UI never flashes empty bars.
  let local_providers = includeRemote
    ? localOnly
    : mergePreviousProviderRemotes(localOnly, previous?.local_providers);

  const codexLocal = local_providers.find((p) => p.provider === 'codex');
  const today_local = codexLocal?.today ?? { ...EMPTY_LOCAL_PERIOD };
  const month_local = codexLocal?.month ?? { ...EMPTY_LOCAL_PERIOD };
  const spend = computeSpend(month_local);

  let window_5h: WindowUsage = { ...EMPTY_WINDOW };
  let window_weekly: WindowUsage = { ...EMPTY_WINDOW };
  let rate_limits: RateLimitBucket[] = [];
  const [lifetime_used, last_reset_at] = await Promise.all([getResetCount(), getLastResetAt()]);
  let banked_resets: BankedResets = {
    available: null,
    credits: [],
    lifetime_used,
    last_reset_at,
  };

  // Seed from previous so phase-A paint keeps last Codex numbers.
  if (previous) {
    window_5h = previous.window_5h;
    window_weekly = previous.window_weekly;
    rate_limits = previous.rate_limits;
    if (previous.banked_resets) {
      banked_resets = {
        ...previous.banked_resets,
        lifetime_used,
        last_reset_at,
      };
    }
  }

  if (includeRemote) {
    // Codex + Grok + Mistral remotes in parallel (main wait after local scan).
    const home = await nativeApi()?.os.getPath('home').catch(() => null);
    const [codexResult, enrichedProviders] = await Promise.all([
      fetchCodexRemoteQuota().then(
        (r) => ({ ok: true as const, ...r }),
        (e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
      ),
      home
        ? enrichProviderRemotes(localOnly, home)
        : Promise.resolve(localOnly),
    ]);

    local_providers = enrichedProviders;

    if (codexResult.ok) {
      window_5h = codexResult.window_5h;
      window_weekly = codexResult.window_weekly;
      rate_limits = codexResult.rate_limits;
      banked_resets = {
        ...codexResult.banked_resets,
        lifetime_used,
        last_reset_at,
      };
      provider = codexResult.provider;
      remoteLimitsOk = true;
    } else {
      const message = codexResult.error;
      error = message.replace(/^(NO_AUTH|PARSE_ERROR|AUTH_EXPIRED):\s*/, '');
      error_kind = classifyRemoteError(message);
    }
  }

  // Local JSONL is a last-resort gap filler only.
  const localLimits = await parseLatestRateLimits();
  // A successful remote read with one missing lane is authoritative: newer
  // accounts can legitimately expose only the weekly window. Do not resurrect
  // an old short window from stale session JSONL in that case.
  if (localLimits && !remoteLimitsOk) {
    const normalizedLocal = normalizeCodexWindows(localLimits.primary, localLimits.secondary);
    if (isWindowMissing(window_5h)) {
      window_5h = coalesceWindow(window_5h, normalizedLocal.window_5h);
    }
    if (isWindowMissing(window_weekly)) {
      window_weekly = coalesceWindow(window_weekly, normalizedLocal.window_weekly);
    }
    if (!rate_limits.length && (!isWindowMissing(window_5h) || !isWindowMissing(window_weekly))) {
      rate_limits = [{
        id: 'codex',
        name: null,
        primary: window_5h,
        secondary: window_weekly,
        plan_type: null,
      }];
    }
  }

  // On remote failure keep the last good rate-limit view instead of flashing 0/0.
  if (!remoteLimitsOk && previous) {
    window_5h = coalesceWindow(window_5h, previous.window_5h);
    window_weekly = coalesceWindow(window_weekly, previous.window_weekly);
    if (!rate_limits.length && previous.rate_limits.length) {
      rate_limits = previous.rate_limits;
    }
    if (banked_resets.available === null && previous.banked_resets.available !== null) {
      banked_resets = {
        ...banked_resets,
        available: previous.banked_resets.available,
        credits: previous.banked_resets.credits.length
          ? previous.banked_resets.credits
          : banked_resets.credits,
      };
    }
  }

  if (rate_limits.length === 1 && rate_limits[0].id === 'codex') {
    rate_limits = [{
      ...rate_limits[0],
      primary: window_5h,
      secondary: window_weekly,
    }];
  }

  return {
    fetched_at: now.toISOString(),
    provider,
    window_5h,
    window_weekly,
    rate_limits,
    today_local,
    month_local,
    local_providers,
    banked_resets,
    spend,
    error,
    error_kind,
  };
}

/** Local disk capture only — no Grok/Mistral network enrich. */
async function captureLocalProvidersOnly(): Promise<ProviderLocalUsage[]> {
  const api = nativeApi();
  if (!api) return [];
  try {
    const home = await api.os.getPath('home');
    return await captureAllLocalProviders(
      {
        readFile: (path) => api.filesystem.readFile(path),
        readDirectory: (path) => api.filesystem.readDirectory(path),
        getStats: (path) => api.filesystem.getStats(path),
      },
      home,
    );
  } catch {
    return [];
  }
}

/** Reattach previous remote quota onto freshly scanned local providers. */
function mergePreviousProviderRemotes(
  fresh: ProviderLocalUsage[],
  previous?: ProviderLocalUsage[],
): ProviderLocalUsage[] {
  if (!previous?.length) return fresh;
  const prevById = new Map(previous.map((p) => [p.provider, p]));
  return fresh.map((p) => {
    const prev = prevById.get(p.provider);
    if (!prev?.remote || prev.remote.error) return p;
    return {
      ...p,
      remote: prev.remote,
      authOk: p.authOk ?? prev.authOk,
    };
  });
}

async function enrichProviderRemotes(
  providers: ProviderLocalUsage[],
  home: string,
): Promise<ProviderLocalUsage[]> {
  return Promise.all(providers.map(async (p) => {
    if (p.provider === 'grok' && p.available) {
      try {
        const remote = await fetchGrokRemoteQuota(home);
        return { ...p, remote, authOk: p.authOk ?? true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Keep previous remote numbers if enrich fails mid-session.
        if (p.remote && !p.remote.error) {
          return { ...p, remote: { ...p.remote, error: message } };
        }
        return {
          ...p,
          remote: {
            source: 'grok-billing',
            primary: { ...EMPTY_WINDOW },
            secondary: { ...EMPTY_WINDOW },
            products: [],
            fetched_at: new Date().toISOString(),
            error: message,
          },
        };
      }
    }
    if (p.provider === 'mistral' && p.available) {
      try {
        const remote = await fetchMistralRemoteQuota(home, p);
        return { ...p, remote, authOk: p.authOk ?? true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (p.remote && !p.remote.error) {
          return { ...p, remote: { ...p.remote, error: message } };
        }
        return p;
      }
    }
    return p;
  }));
}

async function fetchCodexRemoteQuota(): Promise<{
  provider: string;
  window_5h: WindowUsage;
  window_weekly: WindowUsage;
  rate_limits: RateLimitBucket[];
  banked_resets: BankedResets;
}> {
  try {
    const remote = parseCodexUsage(await callCodexAppServer('account/rateLimits/read', {}))
      ?? (() => { throw new Error('PARSE_ERROR: Codex app-server 未返回可识别的额度'); })();
    return {
      provider: 'codex-app-server',
      window_5h: remote.window_5h,
      window_weekly: remote.window_weekly,
      rate_limits: remote.rate_limits,
      banked_resets: remote.banked_resets,
    };
  } catch (appServerError) {
    const auth = await loadCodexAuth();
    if (!auth.ok) throw new Error(`NO_AUTH: ${auth.reason}`);
    const remote = await fetchWhamUsage(auth.auth);
    if (!remote.rate_limits.length) throw appServerError;
    return {
      provider: 'codex-http',
      window_5h: remote.window_5h,
      window_weekly: remote.window_weekly,
      rate_limits: remote.rate_limits,
      banked_resets: remote.banked_resets,
    };
  }
}

/**
 * Official Grok CLI billing API — same host the Grok CLI uses.
 * Auth: Bearer token from ~/.grok/auth.json (OIDC session key).
 */
async function fetchGrokRemoteQuota(home: string) {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino 不可用');

  let authRaw: string;
  try {
    authRaw = await api.filesystem.readFile(`${home}/.grok/auth.json`);
  } catch {
    throw new Error('未找到 ~/.grok/auth.json，请先 grok login');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(authRaw);
  } catch {
    throw new Error('~/.grok/auth.json 无法解析');
  }

  const token = loadGrokAccessToken(parsed);
  if (!token) throw new Error('~/.grok/auth.json 中没有可用 access token');

  if (token.expiresAt) {
    const exp = Date.parse(token.expiresAt);
    if (Number.isFinite(exp) && exp < Date.now() - 30_000) {
      throw new Error('Grok token 已过期，请在终端重新登录 grok');
    }
  }

  const auth = { kind: 'bearer' as const, accessToken: token.token };
  const [credits, monthly] = await Promise.all([
    curlJson(GROK_BILLING_CREDITS_URL, auth, 'GET'),
    curlJson(GROK_BILLING_MONTHLY_URL, auth, 'GET'),
  ]);

  if (!credits.ok && !monthly.ok) {
    if (credits.status === 401 || monthly.status === 401) {
      throw new Error('AUTH_EXPIRED: Grok billing 拒绝了当前 token');
    }
    throw new Error(`Grok billing 失败（HTTP ${credits.status || monthly.status}）`);
  }

  return parseGrokBillingResponses(
    credits.ok ? credits.json : {},
    monthly.ok ? monthly.json : {},
  );
}

/**
 * Mistral token quota (Free = monthly when headers exist):
 * 1) Minimal chat probe → x-ratelimit-*-tokens-month / minute headers
 * 2) Local calendar-month tokens when month limit not exposed (many Free medium pools)
 * 3) Optional whoami plan label (often CF-blocked)
 * 4) Optional Admin spend/rate when Admin API key works
 */
async function fetchMistralRemoteQuota(home: string, base: ProviderLocalUsage) {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino 不可用');

  const localMonthTokens = base.month?.tokens ?? 0;
  let planLabel = base.remote?.plan_label ?? 'API Free';
  let apiKey: string | null = null;
  try {
    apiKey = extractMistralApiKey(await api.filesystem.readFile(`${home}/.vibe/.env`));
  } catch {
    // no key
  }
  if (!apiKey) {
    if (base.remote) return base.remote;
    throw new Error('未配置 MISTRAL_API_KEY');
  }

  let activeModel = 'mistral-small-latest';
  try {
    activeModel = parseVibeActiveModel(await api.filesystem.readFile(`${home}/.vibe/config.toml`));
  } catch {
    // default
  }

  // Official free-tier token windows live on chat response headers for the
  // active model pool (month caps are pool-specific — never mix models).
  // Probe burns a few tokens + RTT — cache 10 minutes per model.
  let limits = null as ReturnType<typeof parseMistralRateLimitHeaders> | null;
  const probeHit = mistralProbeCache
    && mistralProbeCache.model === activeModel
    && Date.now() - mistralProbeCache.at < MISTRAL_PROBE_TTL_MS
    ? mistralProbeCache
    : null;
  if (probeHit) {
    limits = probeHit.limits;
  } else {
    try {
      const probe = await curlMistralRateLimitProbe(apiKey, activeModel);
      if (probe.headers) {
        limits = parseMistralRateLimitHeaders(probe.headers);
        mistralProbeCache = { at: Date.now(), model: activeModel, limits };
      }
    } catch {
      // keep local month
    }
  }

  // Skip whoami on warm path (often CF-blocked); only try when no plan yet.
  if (!planLabel || planLabel === 'API Free') {
    try {
      const who = await curlJson(
        MISTRAL_VIBE_WHOAMI_URL,
        { kind: 'bearer', accessToken: apiKey },
        'GET',
      );
      if (who.ok) {
        const plan = parseVibeWhoAmI(who.json);
        if (plan) planLabel = plan.plan_label;
      }
    } catch {
      // optional
    }
  }

  let remote = buildMistralTokenQuota({
    localMonthTokens,
    limits,
    planLabel,
    model: activeModel,
  });

  // Admin API only when probe didn't give month limits (regular studio keys often 401).
  if (!(limits?.monthLimit && limits.monthLimit > 0)) {
    try {
      const [spend, rate] = await Promise.all([
        curlJsonXApiKey(MISTRAL_ADMIN_SPEND_URL, apiKey),
        curlJsonXApiKey(MISTRAL_ADMIN_RATE_URL, apiKey),
      ]);
      if (spend.ok || rate.ok) {
        remote = parseMistralAdminLimits(
          spend.ok ? spend.json : {},
          rate.ok ? rate.json : {},
          remote,
        );
      }
    } catch {
      // optional
    }
  }

  return remote;
}

/** Tiny chat completion to read Free-tier x-ratelimit-* token headers. */
async function curlMistralRateLimitProbe(
  apiKey: string,
  model: string,
): Promise<{ status: number; headers: string }> {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino API unavailable');

  const headerPath = await writeTempScript('codex-ui-mistral-hdr', '', '.hdr');
  const requestBody = {
    model,
    messages: [{ role: 'user', content: '.' }],
    max_tokens: 1,
  };
  const config = [
    `url = ${curlConfigQuote(MISTRAL_CHAT_URL)}`,
    'request = "POST"',
    'silent',
    'show-error',
    'max-time = 15',
    // Discard body; we only need rate-limit headers.
    'output = "/dev/null"',
    `dump-header = ${curlConfigQuote(headerPath)}`,
    'write-out = "%{http_code}"',
    `header = ${curlConfigQuote(`Authorization: Bearer ${apiKey}`)}`,
    'header = "accept: application/json"',
    'header = "content-type: application/json"',
    'header = "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"',
    `data = ${curlConfigQuote(JSON.stringify(requestBody))}`,
  ].join('\n');

  const curlBin = await resolveBin('curl') ?? 'curl';
  const cfgPath = await writeTempScript('codex-ui-mistral-probe', config, '.conf');
  let out: { stdOut: string; stdErr: string; exitCode: number };
  try {
    try {
      await api.os.execCommand(`chmod 600 ${shellQuote(cfgPath)}`);
    } catch {
      // ignore
    }
    out = await api.os.execCommand(`${shellQuote(curlBin)} -K ${shellQuote(cfgPath)}`);
  } finally {
    await safeRemove(cfgPath);
  }

  const status = Number(out.stdOut.trim()) || (out.exitCode === 0 ? 200 : 0);

  let headers = '';
  try {
    headers = await api.filesystem.readFile(headerPath);
  } catch {
    headers = '';
  } finally {
    await safeRemove(headerPath);
  }

  return { status, headers };
}

/** Admin API uses x-api-key header (not ChatGPT Bearer shape). */
async function curlJsonXApiKey(
  url: string,
  apiKey: string,
): Promise<{ ok: boolean; status: number; json: unknown; detail?: string }> {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino API unavailable');

  const config = [
    `url = ${curlConfigQuote(url)}`,
    'silent',
    'show-error',
    'max-time = 12',
    'write-out = "\\n%{http_code}"',
    'header = "accept: application/json"',
    `header = ${curlConfigQuote(`x-api-key: ${apiKey}`)}`,
    'header = "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"',
  ].join('\n');

  const curlBin = await resolveBin('curl') ?? 'curl';
  const cfgPath = await writeTempScript('codex-ui-mistral', config, '.conf');
  let out: { stdOut: string; stdErr: string; exitCode: number };
  try {
    try {
      await api.os.execCommand(`chmod 600 ${shellQuote(cfgPath)}`);
    } catch {
      // ignore
    }
    out = await api.os.execCommand(`${shellQuote(curlBin)} -K ${shellQuote(cfgPath)}`);
  } finally {
    await safeRemove(cfgPath);
  }

  const responseText = out.stdOut.trimEnd();
  const splitAt = responseText.lastIndexOf('\n');
  const payload = splitAt >= 0 ? responseText.slice(0, splitAt) : responseText;
  const status = splitAt >= 0 ? Number(responseText.slice(splitAt + 1)) : out.exitCode === 0 ? 200 : 0;

  let json: unknown = null;
  let detail: string | undefined;
  const trimmed = payload.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      detail = trimmed.startsWith('<') ? '收到 HTML 响应' : trimmed.slice(0, 160);
    }
  }

  return {
    ok: status >= 200 && status < 300 && json !== null,
    status: Number.isFinite(status) ? status : 0,
    json,
    detail,
  };
}

async function afterSnapshot(snapshot: UsageSnapshot) {
  const settings = await loadSettings();
  const constrained = mostConstrainedCodexWindow(snapshot.window_5h, snapshot.window_weekly);
  const percent = constrained?.window.percent ?? 0;
  const label = constrained?.label ?? '额度';
  await configureTray(percent, snapshot.banked_resets.available ?? 0, label);

  const shouldNotify =
    settings.notify_at_90_pct &&
    !snapshot.error_kind &&
    percent >= 90 &&
    !quotaAlertActive;

  if (percent < 85 || snapshot.error_kind) {
    quotaAlertActive = false;
  } else if (shouldNotify) {
    quotaAlertActive = true;
  }

  if (shouldNotify) {
    await nativeApi()?.os.showNotification('Codex 用量提醒', `${label}已使用 ${percent.toFixed(0)}%`, 'WARNING');
  }
}

async function configureTray(percent: number, resets: number, label: string) {
  const api = nativeApi();
  if (!api) return;
  try {
    await api.os.setTray({
      icon: '/icons/tray.png',
      menuItems: [
        { id: 'status', text: `${label} ${percent.toFixed(0)}% · reset ${resets}`, isDisabled: true },
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

/**
 * HTTP fallback when app-server is unavailable.
 * Prefer /api/codex/usage, but Cloudflare often returns HTML 403 for that path
 * even with a valid CLI token — always try /wham/usage next. Only treat real
 * HTTP 401 JSON auth failures as token expiry.
 */
async function fetchWhamUsage(auth: Auth): Promise<Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'>> {
  const attempts: Array<{
    url: string;
    parse: (json: unknown) => Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'> | null;
  }> = [
    {
      url: CODEX_USAGE_URL,
      parse: (json) => parseCodexUsage(json),
    },
    {
      url: WHAM_USAGE_URL,
      parse: (json) => parseWhamResponse(json),
    },
  ];

  let lastStatus = 0;
  let sawUnauthorized = false;
  let lastDetail = '';

  for (const attempt of attempts) {
    const res = await curlJson(attempt.url, auth, 'GET');
    lastStatus = res.status;
    lastDetail = res.detail ?? '';

    if (res.status === 401 || isUnauthorizedBody(res.json, res.detail)) {
      sawUnauthorized = true;
      continue;
    }

    // Cloudflare / WAF HTML 403 must not abort the whole chain.
    if (!res.ok) continue;

    const parsed = attempt.parse(res.json);
    if (parsed && hasUsableRemoteWindows(parsed)) return parsed;
    if (parsed) return parsed;
  }

  if (sawUnauthorized) {
    throw new Error('AUTH_EXPIRED: 服务端拒绝了当前 access token，请重新运行 codex login');
  }
  throw new Error(
    lastDetail
      ? `usage 请求失败（HTTP ${lastStatus}）：${lastDetail}`
      : `usage 请求失败（HTTP ${lastStatus || 'unknown'}）`,
  );
}

function hasUsableRemoteWindows(
  remote: Pick<UsageSnapshot, 'window_5h' | 'window_weekly'>,
): boolean {
  return !isWindowMissing(remote.window_5h) || !isWindowMissing(remote.window_weekly);
}

function isUnauthorizedBody(json: unknown, detail?: string): boolean {
  const text = `${detail ?? ''} ${typeof json === 'string' ? json : JSON.stringify(json ?? {})}`.toLowerCase();
  if (!text.trim()) return false;
  // HTML challenge pages are not auth failures.
  if (text.includes('<html') || text.includes('cloudflare') || text.includes('just a moment')) {
    return false;
  }
  return (
    text.includes('unauthorized')
    || text.includes('unauthenticated')
    || text.includes('invalid_token')
    || text.includes('token_expired')
    || text.includes('access token')
    || text.includes('"code":"token_expired"')
  );
}

/** Map transport errors without treating WAF 403 as "token expired". */
function classifyRemoteError(message: string): string {
  if (message.startsWith('NO_AUTH:')) return 'NO_AUTH';
  if (message.startsWith('PARSE_ERROR:')) return 'PARSE_ERROR';
  if (message.startsWith('AUTH_EXPIRED:') || message.startsWith('COOKIE_EXPIRED:')) {
    return 'COOKIE_EXPIRED';
  }
  // Bare "403" used to match Cloudflare blocks and false-positive as expired.
  if (/\b401\b/.test(message) && /auth|鉴权|unauthor|token/i.test(message)) {
    return 'COOKIE_EXPIRED';
  }
  return 'NETWORK_ERROR';
}

async function callCodexAppServer(method: string, params: unknown): Promise<unknown> {
  const api = nativeApi();
  if (!api) throw new Error('Codex app-server 需要 Neutralino 运行时');

  // Write bridge to a temp file so the request JSON is NOT visible in `ps`
  // via `node -e '...'` argv (audit F1).
  const tmpPath = await writeTempScript('codex-ui-app-server', `
const { spawn } = require('node:child_process');
const request = ${JSON.stringify({ method, id: 2, params })};
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
  try { child.kill(); } catch {}
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
      send(request);
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
});
`);

  try {
    const nodeBin = await resolveBin('node') ?? 'node';
    const out = await api.os.execCommand(`${shellQuote(nodeBin)} ${shellQuote(tmpPath)}`);
    if (out.exitCode !== 0 || !out.stdOut.trim()) {
      throw new Error(out.stdErr.trim() || 'Codex app-server 调用失败');
    }
    try {
      return JSON.parse(out.stdOut);
    } catch {
      throw new Error('PARSE_ERROR: Codex app-server 返回了无效 JSON');
    }
  } finally {
    await safeRemove(tmpPath);
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

async function curlJson(
  url: string,
  auth: Auth,
  method: 'GET' | 'POST',
  requestBody?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown; detail?: string }> {
  const api = nativeApi();
  if (!api) {
    throw new Error('Neutralino API unavailable');
  }

  // Prefer temp config file (0600 via umask) so the Bearer token is not kept in
  // long-lived process argv; stdin is also used as a second channel if write fails.
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

  const curlBin = await resolveBin('curl') ?? 'curl';
  let out: { stdOut: string; stdErr: string; exitCode: number };
  const cfgPath = await writeTempScript('codex-ui-curl', config, '.conf');
  try {
    // Restrict permissions best-effort (Neutralino has no chmod API).
    try {
      await api.os.execCommand(`chmod 600 ${shellQuote(cfgPath)}`);
    } catch {
      // ignore
    }
    out = await api.os.execCommand(`${shellQuote(curlBin)} -K ${shellQuote(cfgPath)}`);
  } finally {
    await safeRemove(cfgPath);
  }

  const responseText = out.stdOut.trimEnd();
  const splitAt = responseText.lastIndexOf('\n');
  const payload = splitAt >= 0 ? responseText.slice(0, splitAt) : responseText;
  const status = splitAt >= 0 ? Number(responseText.slice(splitAt + 1)) : out.exitCode === 0 ? 200 : 0;

  if (out.exitCode !== 0 && (!Number.isFinite(status) || status === 0)) {
    throw new Error(out.stdErr || 'curl 请求失败');
  }

  // Never throw on 401/403 here — callers decide. Cloudflare often answers
  // /api/codex/usage with HTML 403 while /wham/usage succeeds with the same token.
  let json: unknown = null;
  let detail: string | undefined;
  const trimmed = payload.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      detail = trimmed.startsWith('<')
        ? '收到 HTML 响应（可能是 Cloudflare 拦截）'
        : trimmed.slice(0, 160);
      json = null;
    }
  }

  return {
    ok: status >= 200 && status < 300 && json !== null,
    status: Number.isFinite(status) ? status : 0,
    json,
    detail,
  };
}

async function writeTempScript(prefix: string, content: string, ext = '.js'): Promise<string> {
  const api = nativeApi();
  if (!api) throw new Error('Neutralino API unavailable');
  const tmpDir = await api.os.getPath('temp');
  const path = `${tmpDir}/${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  await api.filesystem.writeFile(path, content);
  return path;
}

async function safeRemove(path: string): Promise<void> {
  try {
    await nativeApi()?.filesystem.removeFile(path);
  } catch {
    // best-effort cleanup
  }
}

const binCache = new Map<string, string | null>();

/** Resolve absolute path for a binary to reduce PATH hijack surface. */
async function resolveBin(name: string): Promise<string | null> {
  if (binCache.has(name)) return binCache.get(name) ?? null;
  const api = nativeApi();
  if (!api) {
    binCache.set(name, null);
    return null;
  }
  try {
    const out = await api.os.execCommand(`command -v ${shellQuote(name)}`);
    const path = out.stdOut.trim().split('\n')[0]?.trim() || '';
    const resolved = out.exitCode === 0 && path.startsWith('/') ? path : null;
    binCache.set(name, resolved);
    return resolved;
  } catch {
    binCache.set(name, null);
    return null;
  }
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
      if (!primary && !secondary) continue;
      const ts = Date.parse(String(parsedRecord.timestamp ?? payload.timestamp ?? '')) || Date.now();
      if (!latest || ts > latest.timestamp) {
        latest = {
          timestamp: ts,
          primary: primary ?? { ...EMPTY_WINDOW },
          secondary: secondary ?? { ...EMPTY_WINDOW },
        };
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

// Note: execCommand is only used for readlink, chmod, command -v, node bridge, curl.
// Prefer temp files over node -e / curl stdin for secrets (see callCodexAppServer / curlJson).
