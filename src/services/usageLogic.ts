import type { ModelUsage, PeriodUsage, SpendInfo, UsageSnapshot, WindowUsage } from '../types';

export const EMPTY_WINDOW: WindowUsage = {
  used: 0,
  limit: 0,
  percent: 0,
  reset_at_unix: 0,
  remaining_secs: 0,
};

export type ModelTokenMap = Map<string, { input: number; cached: number; output: number }>;

export function parseCodexUsage(raw: any): Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'banked_resets'> | null {
  const limits =
    array(raw?.rateLimits) ??
    array(raw?.rate_limits) ??
    (raw?.rateLimitsByLimitId ? Object.values(raw.rateLimitsByLimitId) : null) ??
    (raw?.rate_limits_by_limit_id ? Object.values(raw.rate_limits_by_limit_id) : null);
  if (!limits?.length) return null;

  const best = limits.find((limit: any) => String(limit?.limitId ?? limit?.limit_id ?? '').toLowerCase() === 'codex') ?? limits[0];
  return {
    window_5h: parseRateLimitWindow(best?.primary) ?? { ...EMPTY_WINDOW },
    window_weekly: parseRateLimitWindow(best?.secondary) ?? { ...EMPTY_WINDOW },
    banked_resets: {
      available: parseCredits(best?.credits ?? raw?.credits),
      lifetime_used: 0,
      last_reset_at: null,
    },
  };
}

export function parseRateLimitWindow(raw: any, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage | null {
  const percent = numberField(raw, ['usedPercent', 'used_percent']);
  const resetAt = timestampField(raw, ['resetsAt', 'resets_at']);
  if (percent === null || resetAt === null) return null;
  return {
    used: Math.round(percent),
    limit: 100,
    percent: clamp(percent, 0, 100),
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt - nowUnix),
  };
}

export function parseCredits(raw: any): number | null {
  if (!raw || raw.unlimited) return null;
  if (raw.hasCredits === false || raw.has_credits === false) return 0;
  const balance = numberField(raw, ['balance']);
  return balance === null ? null : Math.max(0, Math.floor(balance));
}

export function parseWhamResponse(raw: any): Pick<UsageSnapshot, 'window_5h' | 'window_weekly' | 'banked_resets'> {
  let window_5h: WindowUsage = { ...EMPTY_WINDOW };
  let window_weekly: WindowUsage = { ...EMPTY_WINDOW };
  const grants = array(raw?.grants) ?? [];

  for (const grant of grants) {
    const type = String(grant?.grant_type ?? '');
    if (type.includes('5h') || type.includes('hourly') || type.includes('short')) {
      window_5h = fillWindowFromGrant(grant);
    } else if (type.includes('week') || type.includes('daily') || type.includes('long')) {
      window_weekly = fillWindowFromGrant(grant);
    }
  }

  const flat = raw?.usage;
  if (flat?.plus_5h || flat?.pro_5h) window_5h = fillWindowFromGrant(flat.plus_5h ?? flat.pro_5h);
  if (flat?.plus_weekly || flat?.pro_weekly) window_weekly = fillWindowFromGrant(flat.plus_weekly ?? flat.pro_weekly);

  return {
    window_5h,
    window_weekly,
    banked_resets: {
      available: typeof raw?.banked_resets?.available === 'number' ? raw.banked_resets.available : null,
      lifetime_used: 0,
      last_reset_at: null,
    },
  };
}

export function fillWindowFromGrant(grant: any, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage {
  const used = Number(grant?.used ?? 0);
  const limit = Number(grant?.limit ?? 0);
  const resetAt = timestampField(grant, ['reset_at', 'resetAt']) ?? 0;
  const percent = limit > 0 ? clamp((used / limit) * 100, 0, 100) : 0;
  return {
    used,
    limit,
    percent,
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

    const payload = entry.payload;
    if (payload?.model) currentModel = String(payload.model);
    if (payload?.type === 'token_count') {
      const usage = payload?.info?.last_token_usage;
      if (usage) {
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

    const message = entry.message;
    const role = entry.role ?? message?.role;
    const model = entry.model ?? message?.model ?? currentModel ?? 'unknown';
    const usage = entry.usage ?? message?.usage;
    if (role) messages += 1;
    if (usage) {
      const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens ?? 0);
      const cached = Math.min(
        Number(usage.cached_input_tokens ?? usage.cachedInputTokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0),
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

export function parseLocalLimitWindow(raw: any, nowUnix = Math.floor(Date.now() / 1000)): WindowUsage | null {
  const percent = Number(raw?.used_percent ?? raw?.usedPercent);
  if (!Number.isFinite(percent)) return null;
  let resetAt = Number(raw?.resets_at ?? raw?.resetsAt ?? 0);
  const windowMinutes = Number(raw?.window_minutes ?? raw?.windowDurationMins ?? 0);
  if (resetAt > 0 && resetAt <= nowUnix && windowMinutes > 0) {
    const windowSecs = windowMinutes * 60;
    resetAt = resetAt + (Math.floor((nowUnix - resetAt) / windowSecs) + 1) * windowSecs;
    return {
      used: 0,
      limit: 100,
      percent: 0,
      reset_at_unix: resetAt,
      remaining_secs: Math.max(0, resetAt - nowUnix),
    };
  }
  return {
    used: Math.round(percent),
    limit: 100,
    percent: clamp(percent, 0, 100),
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
      cost_usd: 0,
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

const PRICES: Array<{ prefix: string; input: number; cached: number; output: number }> = [
  { prefix: 'gpt-5-mini', input: 0.4, cached: 0.04, output: 1.6 },
  { prefix: 'gpt-5', input: 15, cached: 1.5, output: 60 },
  { prefix: 'gpt-4.1-nano', input: 0.1, cached: 0.01, output: 0.4 },
  { prefix: 'gpt-4.1-mini', input: 0.4, cached: 0.04, output: 1.6 },
  { prefix: 'gpt-4.1', input: 2, cached: 0.2, output: 8 },
  { prefix: 'gpt-4o-mini', input: 0.15, cached: 0.015, output: 0.6 },
  { prefix: 'gpt-4o', input: 2.5, cached: 0.25, output: 10 },
  { prefix: 'o4-mini', input: 1.1, cached: 0.11, output: 4.4 },
  { prefix: 'o3-mini', input: 1.1, cached: 0.11, output: 4.4 },
  { prefix: 'o3', input: 10, cached: 1, output: 40 },
  { prefix: 'o1-mini', input: 1.1, cached: 0.11, output: 4.4 },
  { prefix: 'o1', input: 15, cached: 1.5, output: 60 },
  { prefix: 'claude-opus', input: 15, cached: 1.5, output: 75 },
  { prefix: 'claude-sonnet', input: 3, cached: 0.3, output: 15 },
  { prefix: 'claude-haiku', input: 0.8, cached: 0.08, output: 4 },
  { prefix: 'gemini-2.5-pro', input: 1.25, cached: 0.125, output: 10 },
  { prefix: 'gemini-2.5-flash', input: 0.075, cached: 0.0075, output: 0.3 },
  { prefix: 'gemini-2.0', input: 0.1, cached: 0.01, output: 0.4 },
  { prefix: 'gemini', input: 0.1, cached: 0.01, output: 0.4 },
];

export function enrichWithCosts(usage: PeriodUsage): PeriodUsage {
  const models = usage.models.map((model) => {
    const price = priceFor(model.model);
    const cached = Math.min(model.cached_input_tokens, model.input_tokens);
    const uncached = model.input_tokens - cached;
    const cost = uncached * price.input / 1_000_000 + cached * price.cached / 1_000_000 + model.output_tokens * price.output / 1_000_000;
    return { ...model, cost_usd: round(cost, 4) };
  });

  const total = models.reduce((sum, model) => sum + model.input_tokens + model.output_tokens, 0);
  return {
    ...usage,
    models: models.map((model) => ({
      ...model,
      percent_of_total: total > 0 ? ((model.input_tokens + model.output_tokens) / total) * 100 : 0,
    })),
  };
}

export function computeSpend(month: PeriodUsage, now = new Date()): SpendInfo {
  const total = month.models.reduce((sum, model) => sum + model.cost_usd, 0);
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const avg = day > 0 ? total / day : 0;
  return {
    month_total_usd: round(total, 2),
    avg_daily_usd: round(avg, 2),
    projected_usd: round(avg * daysInMonth, 2),
  };
}

export function priceFor(model: string) {
  const lower = model.toLowerCase();
  return PRICES.find((price) => lower.startsWith(price.prefix) || lower.includes(price.prefix)) ?? { input: 2.5, cached: 0.25, output: 10 };
}

export function parseJson(line: string): any | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function timestampField(raw: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw?.[key];
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

export function numberField(raw: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export function array(value: any): any[] | null {
  return Array.isArray(value) ? value : null;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, places: number): number {
  const mul = 10 ** places;
  return Math.round(value * mul) / mul;
}
