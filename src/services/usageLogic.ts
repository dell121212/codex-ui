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

export function parseCodexUsage(raw: unknown): Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'rate_limits' | 'banked_resets'> | null {
  const data = record(raw);
  const entries = rateLimitEntries(data);
  const rate_limits = entries
    .map(([id, value]) => parseRateLimitBucket(value, id))
    .filter((bucket): bucket is RateLimitBucket => bucket !== null);
  if (!rate_limits.length) return null;

  const best = rate_limits.find((limit) => limit.id.toLowerCase() === 'codex') ?? rate_limits[0];
  const resetSummary = parseResetCreditsSummary(
    data.rateLimitResetCredits ?? data.rate_limit_reset_credits,
  );
  return {
    window_5h: best.primary,
    window_weekly: best.secondary,
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
  const resetCredits = parseResetCredits(data.rateLimitResetCredits ?? data.rate_limit_reset_credits);
  const rate_limits: RateLimitBucket[] = [{
    id: 'codex',
    name: null,
    primary: window_5h,
    secondary: window_weekly,
    plan_type: null,
  }];

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
    if (payload.model) currentModel = String(payload.model);
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
  const windowMinutes = Number(data.window_minutes ?? data.windowDurationMins ?? 0);
  if (resetAt > 0 && resetAt <= nowUnix && windowMinutes > 0) {
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
  return {
    used: Math.round(percent),
    limit: 100,
    percent: clamp(percent, 0, 100),
    window_duration_mins: Math.max(0, windowMinutes),
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt - nowUnix),
  };
}

export function buildPeriodUsage(messages: number, tokens: number, modelMap: ModelTokenMap): PeriodUsage {
  const denominator = Math.max(tokens, 1);
  const models: ModelUsage[] = Array.from(modelMap.entries())
    .map(([model, usage]) => ({
      model,
      input_tokens: usage.input,
      cached_input_tokens: usage.cached,
      output_tokens: usage.output,
      cost_usd: null,
      percent_of_total: ((usage.input + usage.output) / denominator) * 100,
    }))
    .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens));
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

const PRICING_AS_OF = '2026-07-10';

// Standard API-equivalent text-token prices in USD per 1M tokens.
const PRICES: Array<{ id: string; input: number; cached: number; output: number }> = [
  { id: 'gpt-5.3-codex', input: 1.75, cached: 0.175, output: 14 },
  { id: 'gpt-5.2-codex', input: 1.75, cached: 0.175, output: 14 },
  { id: 'gpt-5.1-codex', input: 1.25, cached: 0.125, output: 10 },
  { id: 'gpt-5-codex', input: 1.25, cached: 0.125, output: 10 },
  { id: 'codex-mini-latest', input: 1.5, cached: 0.375, output: 6 },
  { id: 'gpt-5.5', input: 5, cached: 0.5, output: 30 },
  { id: 'gpt-5.4-mini', input: 0.75, cached: 0.075, output: 4.5 },
  { id: 'gpt-5.4-nano', input: 0.2, cached: 0.02, output: 1.25 },
  { id: 'gpt-5.4', input: 2.5, cached: 0.25, output: 15 },
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

export function priceFor(model: string) {
  const normalized = model.toLowerCase().trim();
  return PRICES.find(({ id }) => normalized === id || normalized.startsWith(`${id}-20`)) ?? null;
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

export function round(value: number, places: number): number {
  const mul = 10 ** places;
  return Math.round(value * mul) / mul;
}
