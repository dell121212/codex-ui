import type { PeriodUsage, ProviderLocalUsage, WindowUsage } from '../types';
import { readLocalTokenSubtotalCheckpoint } from './localTokenSubtotal';
import type { FileApi } from './localFileAccess';
import { pathExists, walkFiles } from './localFileAccess';
import {
  addModelUsage,
  buildPeriodUsage,
  enrichWithCosts,
  parseRolloutFile,
  type ModelTokenMap,
  type ParsedRolloutFile,
  type TokenUsageEvent,
} from './usageLogic';

const EMPTY_PERIOD: PeriodUsage = { messages: 0, tokens: 0, models: [] };
const DEFAULT_SHORT_WINDOW_MINS = 5 * 60;
const SHORT_WINDOW_MAX_MINS = 12 * 60;
const WEEKLY_WINDOW_MINS = 7 * 24 * 60;

export async function captureCodexLocal(
  api: FileApi,
  home: string,
  now = new Date(),
  upstream?: {
    events: TokenUsageEvent[];
    engine: 'ccusage-rust' | 'typescript-compatibility';
    error?: string;
    eventsRangeFromUnix?: number;
    eventsRangeToUnix?: number;
    summary?: {
      today: PeriodUsage;
      current: PeriodUsage;
      previous: PeriodUsage;
      month: PeriodUsage;
      total: PeriodUsage;
      subtotal: PeriodUsage;
      daily: Array<{ day: string; tokens: number }>;
    };
    latestRateLimits?: ParsedRolloutFile['latestRateLimits'];
  },
): Promise<ProviderLocalUsage> {
  const root = `${home}/.codex`;
  const available = await pathExists(api, root);
  if (!available) {
    return {
      provider: 'codex',
      available: false,
      hasTokens: false,
      usage_engine: upstream?.engine,
      usage_engine_error: upstream?.error,
      today: { ...EMPTY_PERIOD },
      current: { ...EMPTY_PERIOD },
      month: { ...EMPTY_PERIOD },
      total: { ...EMPTY_PERIOD },
    };
  }

  let authOk: boolean;
  try {
    const raw = await api.readFile(`${home}/.codex/auth.json`);
    const parsed = JSON.parse(raw) as { tokens?: { access_token?: string }; access_token?: string };
    authOk = Boolean(parsed?.tokens?.access_token ?? parsed?.access_token);
  } catch {
    authOk = false;
  }

  const rustEngineActive = upstream?.engine === 'ccusage-rust';
  // Reuse the Rust bridge array directly; copying millions of event objects
  // can briefly double the renderer's resident memory.
  const events: TokenUsageEvent[] = rustEngineActive && upstream ? upstream.events : [];
  let latestRateLimits: ParsedRolloutFile['latestRateLimits'] = upstream?.latestRateLimits ?? null;

  // A desktop engine failure must not fall through to parsing every large
  // rollout in the renderer; surface the engine error and keep startup bounded.
  if (!rustEngineActive && !upstream?.error) {
    const files = await walkFiles(
      api,
      `${root}/sessions`,
      (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'),
      0,
      4,
    );
    // Keep compatibility mode bounded too: only one raw JSONL file is read at a time.
    for (const path of files) {
      const parsed = await readCachedRollout(api, path);
      if (!parsed) continue;
      const fallbackTimestamp = rolloutPathTimestamp(path);
      events.push(...parsed.events.map((event) => (
        event.timestamp_unix > 0 ? event : { ...event, timestamp_unix: fallbackTimestamp }
      )));
      const fileRateLimits = parsed.latestRateLimits;
      if (fileRateLimits && (!latestRateLimits || fileRateLimits.timestamp_unix > latestRateLimits.timestamp_unix)) {
        latestRateLimits = fileRateLimits;
      }
    }
  }

  const nowUnix = Math.floor(now.getTime() / 1000);
  const activeWindow = rollActiveWindow(selectActiveWindow(latestRateLimits), nowUnix);
  // Local Codex counters track the current weekly period. The official quota
  // payload still owns its separate 5h window; a lone/unknown short window
  // must not move this local boundary back to that 5h reset.
  const windowMinutes = activeWindow?.window_duration_mins || WEEKLY_WINDOW_MINS;
  const hasPeriodBoundary = Boolean(activeWindow?.reset_at_unix && windowMinutes > 0);
  const currentStart = hasPeriodBoundary
    ? activeWindow!.reset_at_unix - windowMinutes * 60
    : nowUnix - windowMinutes * 60;
  const monthStartUnix = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const todayStartUnix = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);

  const today = upstream?.summary?.today
    ?? usageFromEvents(events.filter((event) => event.timestamp_unix >= todayStartUnix));
  const previousStart = currentStart - windowMinutes * 60;
  // Keep adjacent quota windows disjoint: previous=[previousStart,currentStart),
  // current=[currentStart,now]. Do not derive either value from cumulative totals.
  const current = upstream?.summary?.current ?? usageFromEvents(events.filter((event) => (
    event.timestamp_unix >= currentStart && event.timestamp_unix <= nowUnix
  )));
  const previous = upstream?.summary?.previous ?? usageFromEvents(events.filter((event) => (
    event.timestamp_unix >= previousStart && event.timestamp_unix < currentStart
  )));
  const subtotalCheckpoint = readLocalTokenSubtotalCheckpoint();
  const subtotal = upstream?.summary?.subtotal
    ?? usageFromEvents(events.filter((event) => (
      subtotalCheckpoint == null || event.timestamp_unix > subtotalCheckpoint
    )));
  const month = upstream?.summary?.month
    ?? usageFromEvents(events.filter((event) => event.timestamp_unix >= monthStartUnix));
  const total = upstream?.summary?.total ?? usageFromEvents(events);
  const currentPeriod = hasPeriodBoundary
    ? periodBoundary(currentStart, activeWindow!.reset_at_unix, windowMinutes)
    : undefined;
  const previousPeriod = currentPeriod
    ? periodBoundary(currentStart - windowMinutes * 60, currentStart, windowMinutes)
    : undefined;

  return {
    provider: 'codex',
    available: true,
    hasTokens: total.tokens > 0,
    authOk,
    authPath: `${home}/.codex/auth.json`,
    today,
    current,
    previous,
    subtotal,
    month,
    total,
    current_period_start: currentPeriod?.start_unix,
    current_period_end: activeWindow?.reset_at_unix || undefined,
    // A rolling fallback moves on every scan, so same-day cache continuity
    // must allow events aging out of the seven-day range to lower the count.
    current_period_key: currentPeriod?.key ?? `rolling7d:${currentStart}:${nowUnix}`,
    previous_period_start: previousPeriod?.start_unix,
    previous_period_end: previousPeriod?.end_unix,
    previous_period_key: previousPeriod?.key,
    usage_engine: upstream?.engine ?? 'typescript-compatibility',
    usage_engine_error: upstream?.error,
    events,
    daily_usage: upstream?.summary?.daily,
    local_rate_limits: latestRateLimits ? {
      primary: latestRateLimits.primary,
      secondary: latestRateLimits.secondary,
    } : undefined,
    events_range_from_unix: upstream?.eventsRangeFromUnix,
    events_range_to_unix: upstream?.eventsRangeToUnix,
  };
}

/**
 * Select the local period window independently from the displayed remote
 * quota. A rollout can carry a weekly window with duration metadata while the
 * 5h window only carries its reset; the weekly window owns local current and
 * previous periods. When no weekly type can be established, the caller uses a
 * rolling seven-day fallback without borrowing a short-window reset.
 */
function selectActiveWindow(
  latestRateLimits: ParsedRolloutFile['latestRateLimits'],
): WindowUsage | undefined {
  if (!latestRateLimits) return undefined;

  const windows = [latestRateLimits.primary, latestRateLimits.secondary]
    .filter((window) => hasWindowSignal(window));
  if (!windows.length) return undefined;

  // Duration, rather than primary/secondary position, is the authoritative
  // type signal. Keep the exact seven-day value ahead of any short window so
  // either lane can carry weekly metadata.
  const explicitWeekly = windows.find((window) => window.window_duration_mins === WEEKLY_WINDOW_MINS);
  if (explicitWeekly) return explicitWeekly;

  // Explicit short-only (or ambiguous) quota data intentionally falls
  // through to the rolling seven-day local fallback in captureCodexLocal.
  return undefined;
}

function hasWindowSignal(window: WindowUsage): boolean {
  return window.limit > 0
    || window.used > 0
    || window.percent > 0
    || window.window_duration_mins > 0
    || window.reset_at_unix > 0;
}

function rollActiveWindow(window: WindowUsage | undefined, nowUnix: number): WindowUsage | undefined {
  if (!window || window.window_duration_mins <= 0 || (
    window.window_duration_mins > SHORT_WINDOW_MAX_MINS
    && window.window_duration_mins !== WEEKLY_WINDOW_MINS
  )) {
    return window;
  }
  if (window.reset_at_unix <= 0 || window.reset_at_unix > nowUnix) return window;

  const windowSeconds = window.window_duration_mins * 60;
  const resetAt = window.reset_at_unix
    + (Math.floor((nowUnix - window.reset_at_unix) / windowSeconds) + 1) * windowSeconds;
  return {
    ...window,
    used: 0,
    percent: 0,
    reset_at_unix: resetAt,
    remaining_secs: resetAt - nowUnix,
  };
}

function periodBoundary(startUnix: number, endUnix: number, windowMinutes: number): {
  start_unix: number;
  end_unix: number;
  key: string;
} {
  const mode = windowMinutes === DEFAULT_SHORT_WINDOW_MINS
    ? '5h'
    : windowMinutes === WEEKLY_WINDOW_MINS
      ? '7d'
      : `${windowMinutes}m`;
  return {
    start_unix: startUnix,
    end_unix: endUnix,
    key: `${mode}:${startUnix}:${endUnix}`,
  };
}

async function readCachedRollout(api: FileApi, path: string): Promise<ParsedRolloutFile | null> {
  try {
    return parseRolloutFile(await api.readFile(path));
  } catch {
    return null;
  }
}

function rolloutPathTimestamp(path: string): number {
  const match = path.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!match) return 0;
  return Math.floor(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() / 1000);
}

function usageFromEvents(events: TokenUsageEvent[]): PeriodUsage {
  const modelMap: ModelTokenMap = new Map();
  let tokens = 0;
  for (const event of events) {
    tokens += event.total_tokens;
    addModelUsage(
      modelMap,
      event.model,
      event.input_tokens,
      event.cached_input_tokens,
      event.output_tokens,
      event.cache_creation_tokens,
    );
  }
  return enrichWithCosts(buildPeriodUsage(events.length, tokens, modelMap));
}
