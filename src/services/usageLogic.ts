import type {
  ModelUsage,
  PeriodUsage,
  RateLimitBucket,
  ResetCredit,
  SpendInfo,
  UsageSnapshot,
  WindowUsage,
} from '../types';

type UnknownRecord = Record<string, unknown>;

export const EMPTY_WINDOW: WindowUsage = {
  used: 0,
  limit: 0,
  percent: 0,
  window_duration_mins: 0,
  reset_at_unix: 0,
  remaining_secs: 0,
};

export type ModelTokenMap = Map<string, { input: number; cached: number; output: number }>;

const WEEK_MINUTES = 7 * 24 * 60;
const WEEKLY_WINDOW_FLOOR = 6 * 24 * 60;

/**
 * True when a window carries no server/local signal at all.
 * Legitimate 0% after a reset still has duration / reset_at / limit metadata —
 * those must NOT be treated as "missing" or local fallback will flash fake zeros
 * onto the other window and make quotas look like they jump together.
 */
export function isWindowMissing(window: WindowUsage | null | undefined): boolean {
  if (!window) return true;
  return (
    window.limit === 0
    && window.used === 0
    && window.percent === 0
    && window.window_duration_mins === 0
    && window.reset_at_unix === 0
  );
}

/** Prefer remote; only fill gaps. Never overwrite an explicit 0% reset. */
export function coalesceWindow(preferred: WindowUsage, fallback: WindowUsage | null | undefined): WindowUsage {
  if (!isWindowMissing(preferred)) return preferred;
  if (fallback && !isWindowMissing(fallback)) return fallback;
  return preferred;
}

/**
 * OpenAI's app-server contract exposes generic primary / secondary windows.
 * Most accounts historically used primary=5h and secondary=weekly, but either
 * lane can be absent and newer rollouts can return the weekly window alone.
 * Classify by the server-provided duration first, then use legacy position only
 * when duration metadata is unavailable.
 */
export function normalizeCodexWindows(
  primary: WindowUsage | null | undefined,
  secondary: WindowUsage | null | undefined,
): { window_5h: WindowUsage; window_weekly: WindowUsage } {
  const first = primary && !isWindowMissing(primary) ? primary : null;
  const second = secondary && !isWindowMissing(secondary) ? secondary : null;
  const windows = [first, second].filter((window): window is WindowUsage => window !== null);

  let shortWindow = windows.find((window) => (
    window.window_duration_mins > 0
    && window.window_duration_mins < WEEKLY_WINDOW_FLOOR
  )) ?? null;
  let weeklyWindow = windows.find((window) => (
    window.window_duration_mins >= WEEKLY_WINDOW_FLOOR
  )) ?? null;

  // Legacy payloads sometimes omit duration. Preserve the old positional
  // meaning only for windows that were not classified by duration.
  if (!shortWindow && first && first !== weeklyWindow) shortWindow = first;
  if (!weeklyWindow && second && second !== shortWindow) weeklyWindow = second;

  return {
    window_5h: shortWindow ?? { ...EMPTY_WINDOW },
    window_weekly: weeklyWindow ?? { ...EMPTY_WINDOW },
  };
}

export function windowDurationLabel(window: WindowUsage, fallback = '额度窗口'): string {
  const mins = window.window_duration_mins;
  if (mins === WEEK_MINUTES) return '周额度';
  if (mins === 300) return '5 小时';
  if (mins >= 1_440 && mins % 1_440 === 0) return `${mins / 1_440} 天`;
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} 小时`;
  if (mins > 0) return `${mins} 分钟`;
  return fallback;
}

export function mostConstrainedCodexWindow(
  window5h: WindowUsage,
  weekly: WindowUsage,
): { label: string; window: WindowUsage } | null {
  const windows = [
    { label: windowDurationLabel(window5h, '短周期'), window: window5h },
    { label: windowDurationLabel(weekly, '周额度'), window: weekly },
  ].filter((entry) => !isWindowMissing(entry.window));
  if (!windows.length) return null;
  return windows.sort((a, b) => b.window.percent - a.window.percent)[0];
}

export function parseCodexUsage(raw: unknown): Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'> | null {
  const data = record(raw);
  const entries = rateLimitEntries(data);
  const rate_limits = entries
    .map(([id, value]) => parseRateLimitBucket(value, id))
    .filter((bucket): bucket is RateLimitBucket => bucket !== null);
  if (!rate_limits.length) return null;

  const best = rate_limits.find((limit) => limit.id.toLowerCase() === 'codex') ?? rate_limits[0];
  const normalized = normalizeCodexWindows(best.primary, best.secondary);
  const resetSummary = parseResetCreditsSummary(
    data.rateLimitResetCredits ?? data.rate_limit_reset_credits,
  );
  return {
    ...normalized,
    rate_limits,
    banked_resets: {
      available: resetSummary.available,
      credits: resetSummary.credits,
      lifetime_used: 0,
      last_reset_at: null,
    },
  };
}

export function parseRateLimitBucket(raw: unknown, fallbackId = ''): RateLimitBucket | null {
  const data = record(raw);
  const primary = parseRateLimitWindow(data.primary);
  const secondary = parseRateLimitWindow(data.secondary);
  if (!primary && !secondary) return null;

  const id = String(data.limitId ?? data.limit_id ?? fallbackId).trim() || 'codex';
  const rawName = data.limitName ?? data.limit_name;
  const rawPlan = data.planType ?? data.plan_type;
  return {
    id,
    name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null,
    primary: primary ?? { ...EMPTY_WINDOW },
    secondary: secondary ?? { ...EMPTY_WINDOW },
    plan_type: typeof rawPlan === 'string' && rawPlan.trim() ? rawPlan.trim() : null,
  };
}

export function parseRateLimitWindow(raw: unknown, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage | null {
  const percent = numberField(raw, ['usedPercent', 'used_percent']);
  if (percent === null) return null;
  const resetAt = timestampField(raw, ['resetsAt', 'resets_at']) ?? 0;
  const windowDuration = numberField(raw, ['windowDurationMins', 'window_duration_mins', 'window_minutes']) ?? 0;
  return {
    used: Math.round(percent),
    limit: 100,
    percent: clamp(percent, 0, 100),
    window_duration_mins: Math.max(0, windowDuration),
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt - nowUnix),
  };
}

export function parseCredits(raw: unknown): number | null {
  const data = record(raw);
  if (!raw || data.unlimited) return null;
  if (data.hasCredits === false || data.has_credits === false) return 0;
  const balance = numberField(raw, ['balance']);
  return balance === null ? null : Math.max(0, Math.floor(balance));
}

export function parseResetCredits(raw: unknown): number | null {
  const count = numberField(raw, ['availableCount', 'available_count', 'available']);
  return count === null ? null : Math.max(0, Math.floor(count));
}

export function parseResetCreditsSummary(raw: unknown): { available: number | null; credits: ResetCredit[] } {
  const data = record(raw);
  const details = array(data.credits) ?? [];
  return {
    available: parseResetCredits(raw),
    credits: details.map(parseResetCredit).filter((credit): credit is ResetCredit => credit !== null),
  };
}

function parseResetCredit(raw: unknown): ResetCredit | null {
  const data = record(raw);
  const id = typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) return null;
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
  const description = typeof data.description === 'string' && data.description.trim()
    ? data.description.trim()
    : null;
  return {
    id,
    status: String(data.status ?? 'unknown'),
    title,
    description,
    granted_at: timestampField(raw, ['grantedAt', 'granted_at']) ?? 0,
    expires_at: timestampField(raw, ['expiresAt', 'expires_at']),
  };
}

/**
 * Parse current ChatGPT WHAM / usage payload shapes:
 * - rate_limit.primary_window / secondary_window (2026 live shape)
 * - legacy grants[] / usage.plus_5h flat maps
 */
export function parseWhamResponse(raw: unknown): Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'> {
  const data = record(raw);
  let window_5h: WindowUsage = { ...EMPTY_WINDOW };
  let window_weekly: WindowUsage = { ...EMPTY_WINDOW };
  const grants = array(data.grants) ?? [];

  for (const grant of grants) {
    const item = record(grant);
    const type = String(item.grant_type ?? '');
    if (type.includes('5h') || type.includes('hourly') || type.includes('short')) {
      window_5h = fillWindowFromGrant(grant);
    } else if (type.includes('week') || type.includes('daily') || type.includes('long')) {
      window_weekly = fillWindowFromGrant(grant);
    }
  }

  const flat = record(data.usage);
  if (flat.plus_5h || flat.pro_5h) window_5h = fillWindowFromGrant(flat.plus_5h ?? flat.pro_5h);
  if (flat.plus_weekly || flat.pro_weekly) window_weekly = fillWindowFromGrant(flat.plus_weekly ?? flat.pro_weekly);

  // Live WHAM: { rate_limit: { primary_window: { used_percent, limit_window_seconds, reset_at } } }
  const rateLimit = record(data.rate_limit ?? data.rateLimit);
  const primaryLive = parseWhamLimitWindow(
    rateLimit.primary_window ?? rateLimit.primaryWindow ?? rateLimit.primary,
  );
  const secondaryLive = parseWhamLimitWindow(
    rateLimit.secondary_window ?? rateLimit.secondaryWindow ?? rateLimit.secondary,
  );
  if (primaryLive) window_5h = primaryLive;
  if (secondaryLive) window_weekly = secondaryLive;
  const normalized = normalizeCodexWindows(window_5h, window_weekly);
  window_5h = normalized.window_5h;
  window_weekly = normalized.window_weekly;

  const planTypeRaw = data.plan_type ?? data.planType ?? rateLimit.plan_type ?? rateLimit.planType;
  const plan_type = typeof planTypeRaw === 'string' && planTypeRaw.trim() ? planTypeRaw.trim() : null;

  const resetCredits = parseResetCredits(
    data.rateLimitResetCredits ?? data.rate_limit_reset_credits,
  );

  const rate_limits: RateLimitBucket[] = [{
    id: 'codex',
    name: null,
    primary: window_5h,
    secondary: window_weekly,
    plan_type,
  }];

  // Optional independent model limits when WHAM includes them.
  const extra = array(data.additional_rate_limits ?? data.additionalRateLimits) ?? [];
  for (const item of extra) {
    const bucket = parseRateLimitBucket(item);
    if (bucket && bucket.id.toLowerCase() !== 'codex') rate_limits.push(bucket);
  }

  return {
    window_5h,
    window_weekly,
    rate_limits,
    banked_resets: {
      available: resetCredits,
      credits: [],
      lifetime_used: 0,
      last_reset_at: null,
    },
  };
}

/** WHAM window: used_percent + limit_window_seconds + reset_at (unix or ISO). */
export function parseWhamLimitWindow(raw: unknown, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage | null {
  if (raw == null) return null;
  const percent = numberField(raw, ['used_percent', 'usedPercent']);
  if (percent === null) return null;

  const resetAt = timestampField(raw, ['reset_at', 'resetAt', 'resets_at', 'resetsAt']) ?? 0;
  const windowSecs = numberField(raw, [
    'limit_window_seconds',
    'limitWindowSeconds',
    'window_seconds',
    'windowSeconds',
  ]);
  const windowMinutes = windowSecs !== null
    ? Math.max(0, Math.round(windowSecs / 60))
    : (numberField(raw, ['window_minutes', 'windowDurationMins', 'window_duration_mins']) ?? 0);

  return {
    used: Math.round(clamp(percent, 0, 100)),
    limit: 100,
    percent: clamp(percent, 0, 100),
    window_duration_mins: Math.max(0, windowMinutes),
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt > 0 ? resetAt - nowUnix : 0),
  };
}

export function fillWindowFromGrant(grant: unknown, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage {
  const data = record(grant);
  const used = Number(data.used ?? 0);
  const limit = Number(data.limit ?? 0);
  const resetAt = timestampField(grant, ['reset_at', 'resetAt']) ?? 0;
  const percent = limit > 0 ? clamp((used / limit) * 100, 0, 100) : 0;
  return {
    used,
    limit,
    percent,
    window_duration_mins: numberField(grant, ['windowDurationMins', 'window_duration_mins', 'window_minutes']) ?? 0,
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt - nowUnix),
  };
}

/** Pull model slug from common Codex rollout payload shapes. */
export function extractPayloadModel(payload: unknown): string | null {
  const data = record(payload);
  const direct = data.model;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const thread = record(data.thread_settings);
  if (typeof thread.model === 'string' && thread.model.trim()) return thread.model.trim();

  const collab = record(data.collaboration_mode);
  const collabSettings = record(collab.settings);
  if (typeof collabSettings.model === 'string' && collabSettings.model.trim()) {
    return collabSettings.model.trim();
  }

  const threadCollab = record(thread.collaboration_mode);
  const threadCollabSettings = record(threadCollab.settings);
  if (typeof threadCollabSettings.model === 'string' && threadCollabSettings.model.trim()) {
    return threadCollabSettings.model.trim();
  }

  return null;
}

export function parseRolloutFile(content: string): { messages: number; tokens: number; modelMap: ModelTokenMap } {
  let messages = 0;
  let tokens = 0;
  let currentModel: string | undefined;
  const modelMap: ModelTokenMap = new Map();

  for (const line of content.split('\n')) {
    const entry = parseJson(line);
    if (!entry) continue;

    const entryRecord = record(entry);
    const payload = record(entryRecord.payload);
    const payloadModel = extractPayloadModel(payload);
    if (payloadModel) currentModel = payloadModel;
    if (payload.type === 'token_count') {
      const info = record(payload.info);
      const usageRaw = info.last_token_usage;
      if (usageRaw) {
        const usage = record(usageRaw);
        messages += 1;
        const input = Number(usage.input_tokens ?? 0);
        const cached = Math.min(Number(usage.cached_input_tokens ?? 0), input);
        const output = Number(usage.output_tokens ?? 0);
        const total = Math.max(Number(usage.total_tokens ?? 0), input + output);
        tokens += total;
        // token_count events omit model; use last turn_context / settings model.
        addModelUsage(modelMap, currentModel ?? 'codex', input, cached, output);
        continue;
      }
    }

    const message = record(entryRecord.message);
    const role = entryRecord.role ?? message.role;
    const model = entryRecord.model ?? message.model ?? currentModel ?? 'unknown';
    const usageRaw = entryRecord.usage ?? message.usage;
    if (role) messages += 1;
    if (usageRaw) {
      const usage = record(usageRaw);
      const promptDetails = record(usage.prompt_tokens_details);
      const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens ?? 0);
      const cached = Math.min(
        Number(usage.cached_input_tokens ?? usage.cachedInputTokens ?? promptDetails.cached_tokens ?? 0),
        input,
      );
      const output = Number(usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens ?? 0);
      const total = Number(usage.total_tokens ?? usage.totalTokens ?? 0) || input + output;
      tokens += total;
      addModelUsage(modelMap, String(model), input, cached, output);
    }
  }

  return { messages, tokens, modelMap };
}

export function parseLocalLimitWindow(raw: unknown, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage | null {
  const data = record(raw);
  const percent = Number(data.used_percent ?? data.usedPercent);
  if (!Number.isFinite(percent)) return null;
  let resetAt = Number(data.resets_at ?? data.resetsAt ?? 0);
  // Normalize ms timestamps the same way remote parsing does.
  if (resetAt > 10_000_000_000) resetAt = Math.floor(resetAt / 1000);
  const windowMinutes = Number(data.window_minutes ?? data.windowDurationMins ?? data.window_duration_mins ?? 0);
  if (!Number.isFinite(windowMinutes) || windowMinutes < 0) return null;

  // Only auto-roll short windows from stale session JSONL.
  // Long (daily/weekly) windows must not be zeroed from a shared/stale resets_at —
  // that is what made 7-day look like it reset whenever 5h rolled over.
  const isShortWindow = windowMinutes > 0 && windowMinutes <= 12 * 60;
  if (isShortWindow && resetAt > 0 && resetAt <= nowUnix) {
    const windowSecs = windowMinutes * 60;
    resetAt = resetAt + (Math.floor((nowUnix - resetAt) / windowSecs) + 1) * windowSecs;
    return {
      used: 0,
      limit: 100,
      percent: 0,
      window_duration_mins: Math.max(0, windowMinutes),
      reset_at_unix: resetAt,
      remaining_secs: Math.max(0, resetAt - nowUnix),
    };
  }

  // Long/unknown windows: keep the recorded percent; only clamp remaining.
  return {
    used: Math.round(clamp(percent, 0, 100)),
    limit: 100,
    percent: clamp(percent, 0, 100),
    window_duration_mins: Math.max(0, windowMinutes),
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt > 0 ? resetAt - nowUnix : 0),
  };
}

export function modelTokenTotal(model: Pick<ModelUsage, 'input_tokens' | 'output_tokens'>): number {
  return model.input_tokens + model.output_tokens;
}

/** Models with captured tokens first, highest usage first. Drops empty rows. */
export function rankModelsByTokens(models: ModelUsage[]): ModelUsage[] {
  return models
    .filter((model) => modelTokenTotal(model) > 0)
    .sort((a, b) => modelTokenTotal(b) - modelTokenTotal(a));
}

/**
 * Rank independent quota buckets: models we actually saw in local sessions first,
 * then higher remote usage percent. Unused empty buckets sink to the bottom.
 */
export function rankRateLimitBuckets(
  buckets: RateLimitBucket[],
  usedModels: Iterable<string> = [],
): RateLimitBucket[] {
  const used = [...usedModels]
    .map((id) => id.toLowerCase().trim())
    .filter(Boolean);

  const score = (bucket: RateLimitBucket): number => {
    const id = bucket.id.toLowerCase();
    const name = (bucket.name ?? '').toLowerCase();
    let hit = 0;
    for (const model of used) {
      if (
        model === id
        || model.startsWith(`${id}-`)
        || id.startsWith(`${model}-`)
        || (name && (model.includes(name) || name.includes(model)))
        || model.includes(id)
        || id.includes(model)
      ) {
        hit = 1;
        break;
      }
    }
    const usage = Math.max(bucket.primary.percent, bucket.secondary.percent);
    // used-with-tokens: 2_xxx, used-by-percent only: 1_xxx, idle: 0_xxx
    const tier = hit ? 2 : usage > 0 ? 1 : 0;
    return tier * 1_000 + usage;
  };

  return [...buckets].sort((a, b) => score(b) - score(a));
}

export function buildPeriodUsage(messages: number, tokens: number, modelMap: ModelTokenMap): PeriodUsage {
  const denominator = Math.max(tokens, 1);
  const models = rankModelsByTokens(
    Array.from(modelMap.entries()).map(([model, usage]) => ({
      model,
      input_tokens: usage.input,
      cached_input_tokens: usage.cached,
      output_tokens: usage.output,
      cost_usd: null,
      percent_of_total: ((usage.input + usage.output) / denominator) * 100,
    })),
  );
  return { messages, tokens, models };
}

export function addModelUsage(modelMap: ModelTokenMap, model: string, input: number, cached: number, output: number) {
  const current = modelMap.get(model) ?? { input: 0, cached: 0, output: 0 };
  current.input += input;
  current.cached += cached;
  current.output += output;
  modelMap.set(model, current);
}

export function mergeModelMap(target: ModelTokenMap, source: ModelTokenMap) {
  for (const [model, usage] of source) {
    addModelUsage(target, model, usage.input, usage.cached, usage.output);
  }
}

const PRICING_AS_OF = '2026-07-11';

/**
 * Standard API-equivalent text-token prices in USD per 1M tokens.
 * Source: https://developers.openai.com/api/docs/pricing (standard short-context).
 * Keep longer / more specific ids first is not required — priceFor picks the longest match.
 */
const PRICES: Array<{ id: string; input: number; cached: number; output: number }> = [
  // GPT-5.6 family (current Codex defaults)
  { id: 'gpt-5.6-sol', input: 5, cached: 0.5, output: 30 },
  { id: 'gpt-5.6-terra', input: 2.5, cached: 0.25, output: 15 },
  { id: 'gpt-5.6-luna', input: 1, cached: 0.1, output: 6 },
  // xAI Grok (API-equivalent; local capture often lacks output split)
  { id: 'grok-4.5', input: 3, cached: 0.75, output: 15 },
  { id: 'grok-4', input: 3, cached: 0.75, output: 15 },
  { id: 'grok-3', input: 3, cached: 0.75, output: 15 },
  // Mistral Vibe / Devstral (from Vibe default config.toml prices)
  { id: 'mistral-medium-3.5', input: 1.5, cached: 0.375, output: 7.5 },
  { id: 'mistral-vibe-cli-latest', input: 1.5, cached: 0.375, output: 7.5 },
  { id: 'mistral-medium', input: 1.5, cached: 0.375, output: 7.5 },
  { id: 'devstral-small-latest', input: 0.1, cached: 0.025, output: 0.3 },
  { id: 'devstral-small', input: 0.1, cached: 0.025, output: 0.3 },
  { id: 'devstral', input: 0.1, cached: 0.025, output: 0.3 },
  // GPT-5.5 / 5.4
  { id: 'gpt-5.5-pro', input: 30, cached: 30, output: 180 },
  { id: 'gpt-5.5', input: 5, cached: 0.5, output: 30 },
  { id: 'gpt-5.4-pro', input: 30, cached: 30, output: 180 },
  { id: 'gpt-5.4-mini', input: 0.75, cached: 0.075, output: 4.5 },
  { id: 'gpt-5.4-nano', input: 0.2, cached: 0.02, output: 1.25 },
  { id: 'gpt-5.4', input: 2.5, cached: 0.25, output: 15 },
  // Codex-branded lines
  { id: 'gpt-5.3-codex', input: 1.75, cached: 0.175, output: 14 },
  { id: 'gpt-5.2-codex', input: 1.75, cached: 0.175, output: 14 },
  { id: 'gpt-5.1-codex', input: 1.25, cached: 0.125, output: 10 },
  { id: 'gpt-5-codex', input: 1.25, cached: 0.125, output: 10 },
  { id: 'codex-mini-latest', input: 1.5, cached: 0.375, output: 6 },
  // Older GPT-5 / 4.1
  { id: 'gpt-5.2', input: 1.75, cached: 0.175, output: 14 },
  { id: 'gpt-5', input: 1.25, cached: 0.125, output: 10 },
  { id: 'gpt-4.1-nano', input: 0.1, cached: 0.025, output: 0.4 },
  { id: 'gpt-4.1-mini', input: 0.4, cached: 0.1, output: 1.6 },
  { id: 'gpt-4.1', input: 2, cached: 0.5, output: 8 },
];

export function enrichWithCosts(usage: PeriodUsage): PeriodUsage {
  return {
    ...usage,
    models: usage.models.map((model) => {
      const price = priceFor(model.model);
      if (!price) return { ...model, cost_usd: null };
      const cached = Math.min(model.cached_input_tokens, model.input_tokens);
      const uncached = model.input_tokens - cached;
      const cost = uncached * price.input / 1_000_000
        + cached * price.cached / 1_000_000
        + model.output_tokens * price.output / 1_000_000;
      return { ...model, cost_usd: round(cost, 4) };
    }),
  };
}

export function computeSpend(month: PeriodUsage, now = new Date()): SpendInfo {
  const priced = month.models.filter((model) => model.cost_usd !== null);
  const total = priced.reduce((sum, model) => sum + (model.cost_usd ?? 0), 0);
  const day = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    month_total_usd: round(total, 2),
    avg_daily_usd: round(total / day, 2),
    projected_usd: round((total / day) * daysInMonth, 2),
    unpriced_models: month.models.filter((model) => model.cost_usd === null).map((model) => model.model),
    pricing_as_of: PRICING_AS_OF,
  };
}

/**
 * Match model slug to a price row.
 * Accepts exact ids and suffix variants (`gpt-5.3-codex-high`, date stamps).
 * Longest id wins so `gpt-5.4-mini` is not billed as `gpt-5.4` / `gpt-5`.
 */
export function priceFor(model: string) {
  const normalized = model.toLowerCase().trim();
  if (!normalized) return null;

  let best: (typeof PRICES)[number] | null = null;
  for (const price of PRICES) {
    const id = price.id;
    if (normalized === id || normalized.startsWith(`${id}-`)) {
      if (!best || id.length > best.id.length) best = price;
    }
  }
  return best;
}


export function parseJson(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function timestampField(raw: unknown, keys: string[]): number | null {
  const data = record(raw);
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number') return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : numeric;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
    }
  }
  return null;
}

export function numberField(raw: unknown, keys: string[]): number | null {
  const data = record(raw);
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function rateLimitEntries(data: UnknownRecord): Array<[string, unknown]> {
  const byId = data.rateLimitsByLimitId ?? data.rate_limits_by_limit_id;
  if (byId !== null && typeof byId === 'object' && !Array.isArray(byId)) {
    const entries = Object.entries(byId as UnknownRecord);
    if (entries.length) return entries;
  }

  const legacy = data.rateLimits ?? data.rate_limits;
  if (Array.isArray(legacy)) return legacy.map((value) => ['', value]);
  return legacy !== null && typeof legacy === 'object' ? [['', legacy]] : [];
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : {};
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Continuous heat color for quota meters.
 * Low usage → blue (#0a84ff); high usage → red (#ff453a).
 */
export function usageHeatColor(percent: number): string {
  const t = clamp(percent, 0, 100) / 100;
  // Apple system blue → system red
  const r = Math.round(10 + (255 - 10) * t);
  const g = Math.round(132 + (69 - 132) * t);
  const b = Math.round(255 + (58 - 255) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function round(value: number, places: number): number {
  const mul = 10 ** places;
  return Math.round(value * mul) / mul;
}
