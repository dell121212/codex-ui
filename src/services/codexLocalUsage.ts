import type { PeriodUsage, ProviderLocalUsage, WindowUsage } from '../types';
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
const rolloutCache = new Map<string, { signature: string; parsed: ParsedRolloutFile }>();

export async function captureCodexLocal(
  api: FileApi,
  home: string,
  now = new Date(),
): Promise<ProviderLocalUsage> {
  const root = `${home}/.codex`;
  const available = await pathExists(api, root);
  if (!available) {
    return {
      provider: 'codex',
      available: false,
      hasTokens: false,
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

  const files = await walkFiles(
    api,
    `${home}/.codex/sessions`,
    (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'),
    0,
    4,
  );
  const parsedFiles = await Promise.all(files.map(async (path) => ({
    path,
    parsed: await readCachedRollout(api, path),
  })));
  const events: TokenUsageEvent[] = [];
  let latestRateLimits: ParsedRolloutFile['latestRateLimits'] = null;

  for (const { path, parsed } of parsedFiles) {
    if (!parsed) continue;
    const fallbackTimestamp = rolloutPathTimestamp(path);
    events.push(...parsed.events.map((event) => (
      event.timestamp_unix > 0 ? event : { ...event, timestamp_unix: fallbackTimestamp }
    )));
    if (
      parsed.latestRateLimits
      && (!latestRateLimits || parsed.latestRateLimits.timestamp_unix > latestRateLimits.timestamp_unix)
    ) {
      latestRateLimits = parsed.latestRateLimits;
    }
  }

  const nowUnix = Math.floor(now.getTime() / 1000);
  const activeWindow = [latestRateLimits?.primary, latestRateLimits?.secondary]
    .filter((window): window is WindowUsage => Boolean(window?.window_duration_mins))
    .sort((a, b) => a.window_duration_mins - b.window_duration_mins)[0];
  const currentStart = activeWindow?.reset_at_unix && activeWindow.window_duration_mins
    ? activeWindow.reset_at_unix - activeWindow.window_duration_mins * 60
    : nowUnix - 5 * 60 * 60;
  const monthStartUnix = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const todayStartUnix = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);

  const today = usageFromEvents(events.filter((event) => event.timestamp_unix >= todayStartUnix));
  const current = usageFromEvents(events.filter((event) => (
    event.timestamp_unix >= currentStart && event.timestamp_unix <= nowUnix
  )));
  const month = usageFromEvents(events.filter((event) => event.timestamp_unix >= monthStartUnix));
  const total = usageFromEvents(events);

  return {
    provider: 'codex',
    available: true,
    hasTokens: total.tokens > 0,
    authOk,
    authPath: `${home}/.codex/auth.json`,
    today,
    current,
    month,
    total,
    current_period_end: activeWindow?.reset_at_unix || undefined,
  };
}

async function readCachedRollout(api: FileApi, path: string): Promise<ParsedRolloutFile | null> {
  const cached = rolloutCache.get(path);
  let signature = '';
  if (api.getStats) {
    try {
      const stats = await api.getStats(path);
      signature = `${stats.modifiedAt}:${stats.size}`;
      if (cached?.signature === signature) return cached.parsed;
    } catch {
      if (cached) return cached.parsed;
    }
  }

  try {
    const parsed = parseRolloutFile(await api.readFile(path));
    rolloutCache.set(path, { signature, parsed });
    return parsed;
  } catch {
    return cached?.parsed ?? null;
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
    );
  }
  return enrichWithCosts(buildPeriodUsage(events.length, tokens, modelMap));
}
