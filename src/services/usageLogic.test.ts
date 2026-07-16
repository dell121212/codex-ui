import { describe, expect, it } from 'vitest';
import {
  buildPeriodUsage,
  coalesceWindow,
  computeSpend,
  EMPTY_WINDOW,
  enrichWithCosts,
  isWindowMissing,
  mostConstrainedCodexWindow,
  normalizeCodexWindows,
  parseCodexUsage,
  parseLocalLimitWindow,
  parseRolloutFile,
  parseWhamResponse,
  priceFor,
  rankModelsByTokens,
  rankRateLimitBuckets,
} from './usageLogic';
import type { RateLimitBucket } from '../types';
import type { PeriodUsage, WindowUsage } from '../types';

describe('Codex session JSONL parsing', () => {
  it('parses new token_count events with the current model', () => {
    const content = `
{"timestamp":"2026-07-07T03:35:40.594Z","type":"turn_context","payload":{"model":"gpt-5"}}
{"timestamp":"2026-07-07T03:37:26.568Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":80044,"cached_input_tokens":4480,"output_tokens":1027,"reasoning_output_tokens":881,"total_tokens":81071}}}}
`;

    const parsed = parseRolloutFile(content);

    expect(parsed.messages).toBe(1);
    expect(parsed.tokens).toBe(81071);
    expect(parsed.modelMap.get('gpt-5')).toEqual({ input: 80044, cached: 4480, output: 1027 });
  });

  it('parses nested message usage and token aliases', () => {
    const content = `
{"timestamp":"2026-07-07T03:35:40.594Z","message":{"role":"assistant","model":"gpt-4o","usage":{"prompt_tokens":1000,"prompt_tokens_details":{"cached_tokens":400},"completion_tokens":200,"total_tokens":1200}}}
{"timestamp":"2026-07-07T03:36:40.594Z","role":"assistant","model":"gpt-4o-mini","usage":{"promptTokens":10,"cachedInputTokens":3,"completionTokens":5,"totalTokens":15}}
`;

    const usage = buildPeriodUsage(0, 0, parseRolloutFile(content).modelMap);

    expect(usage.models).toHaveLength(2);
    expect(usage.models[0]).toMatchObject({
      model: 'gpt-4o',
      input_tokens: 1000,
      cached_input_tokens: 400,
      output_tokens: 200,
    });
    expect(usage.models[1]).toMatchObject({
      model: 'gpt-4o-mini',
      input_tokens: 10,
      cached_input_tokens: 3,
      output_tokens: 5,
    });
  });
});

describe('local rate-limit fallback parsing', () => {
  it('parses active primary and secondary rate-limit windows', () => {
    const now = 1_800_000_000;
    const primary = parseLocalLimitWindow({
      used_percent: 16,
      window_minutes: 300,
      resets_at: now + 60,
    }, now);
    const secondary = parseLocalLimitWindow({
      usedPercent: 3,
      windowDurationMins: 10080,
      resetsAt: now + 3600,
    }, now);

    expect(primary).toMatchObject({ percent: 16, used: 16, limit: 100, remaining_secs: 60 });
    expect(secondary).toMatchObject({ percent: 3, used: 3, limit: 100, remaining_secs: 3600 });
  });

  it('resets expired short local windows to zero and advances reset time', () => {
    const now = 1_800_000_000;
    const window = parseLocalLimitWindow({
      used_percent: 100,
      window_minutes: 300,
      resets_at: now - 60,
    }, now);

    expect(window?.percent).toBe(0);
    expect(window?.used).toBe(0);
    expect(window?.remaining_secs).toBeGreaterThan(0);
    expect(window?.reset_at_unix).toBeGreaterThan(now);
  });

  it('does not zero an expired weekly local window (avoids 5h/7d coupled jumps)', () => {
    const now = 1_800_000_000;
    const weekly = parseLocalLimitWindow({
      used_percent: 42,
      window_minutes: 10080,
      resets_at: now - 120,
    }, now);

    expect(weekly?.percent).toBe(42);
    expect(weekly?.used).toBe(42);
    // remaining may be 0 if reset_at is past, but percent stays server/session value
    expect(weekly?.remaining_secs).toBe(0);
  });

  it('treats legitimate 0% after reset as present, not missing', () => {
    const reset: WindowUsage = {
      used: 0,
      limit: 100,
      percent: 0,
      window_duration_mins: 300,
      reset_at_unix: 1_800_000_100,
      remaining_secs: 100,
    };
    const stale: WindowUsage = {
      used: 88,
      limit: 100,
      percent: 88,
      window_duration_mins: 300,
      reset_at_unix: 1_800_000_050,
      remaining_secs: 0,
    };

    expect(isWindowMissing(EMPTY_WINDOW)).toBe(true);
    expect(isWindowMissing(reset)).toBe(false);
    // Must keep remote 0% — do not paint stale local 88%
    expect(coalesceWindow(reset, stale).percent).toBe(0);
    expect(coalesceWindow(EMPTY_WINDOW, stale).percent).toBe(88);
  });

  it('promotes a weekly-only primary window instead of mislabeling it as 5h', () => {
    const weeklyOnly: WindowUsage = {
      used: 37,
      limit: 100,
      percent: 37,
      window_duration_mins: 10_080,
      reset_at_unix: 1_800_086_400,
      remaining_secs: 86_400,
    };

    const normalized = normalizeCodexWindows(weeklyOnly, null);

    expect(isWindowMissing(normalized.window_5h)).toBe(true);
    expect(normalized.window_weekly).toEqual(weeklyOnly);
    expect(mostConstrainedCodexWindow(normalized.window_5h, normalized.window_weekly))
      .toMatchObject({ label: '周额度', window: { percent: 37 } });
  });
});

describe('remote usage response parsing', () => {
  it('parses Codex usage rateLimits array without inferring reset credits', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const parsed = parseCodexUsage({
      rateLimits: [{
        limitId: 'codex',
        primary: { usedPercent: 61, resetsAt: resetAt },
        secondary: { usedPercent: 9, resetsAt: resetAt + 3600 },
        credits: { hasCredits: true, unlimited: false, balance: 1 },
      }],
    });

    expect(parsed?.window_5h.percent).toBe(61);
    expect(parsed?.window_weekly.percent).toBe(9);
    expect(parsed?.banked_resets.available).toBeNull();
  });

  it('parses Codex usage map shape and snake_case fields', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const parsed = parseCodexUsage({
      rateLimitsByLimitId: {
        codex: {
          limit_id: 'codex',
          primary: { used_percent: 25, resets_at: resetAt },
          secondary: { used_percent: 2, resets_at: resetAt + 3600 },
          credits: { has_credits: false, balance: 0 },
        },
      },
    });

    expect(parsed?.window_5h.percent).toBe(25);
    expect(parsed?.window_weekly.percent).toBe(2);
    expect(parsed?.banked_resets.available).toBeNull();
  });

  it('parses the new single weekly window shape', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 86_400;
    const parsed = parseCodexUsage({
      rateLimits: {
        limitId: 'codex',
        primary: {
          usedPercent: 34,
          windowDurationMins: 10_080,
          resetsAt: resetAt,
        },
        secondary: null,
      },
    });

    expect(parsed?.window_weekly).toMatchObject({
      percent: 34,
      window_duration_mins: 10_080,
      reset_at_unix: resetAt,
    });
    expect(isWindowMissing(parsed?.window_5h)).toBe(true);
  });

  it('parses Codex app-server reset credit summary', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const parsed = parseCodexUsage({
      rateLimits: {
        limitId: 'codex',
        primary: { usedPercent: 28, resetsAt: resetAt },
        secondary: { usedPercent: 5, resetsAt: resetAt + 3600 },
        credits: { hasCredits: true, unlimited: false, balance: 99 },
      },
      rateLimitResetCredits: {
        availableCount: 3,
        credits: [{
          id: 'credit-1',
          status: 'available',
          grantedAt: resetAt - 60,
          expiresAt: resetAt + 86_400,
          title: 'Weekly reset',
          description: null,
        }],
      },
    });

    expect(parsed?.window_5h.percent).toBe(28);
    expect(parsed?.banked_resets.available).toBe(3);
    expect(parsed?.banked_resets.credits[0]).toMatchObject({ id: 'credit-1', status: 'available' });
  });

  it('keeps every independent model quota returned by app-server', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    const parsed = parseCodexUsage({
      rateLimitsByLimitId: {
        codex: {
          limitId: 'codex',
          primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: resetAt },
          secondary: { usedPercent: 4, windowDurationMins: 10080, resetsAt: resetAt + 3600 },
        },
        'codex-mini-latest': {
          limitId: 'codex-mini-latest',
          limitName: 'Codex Mini',
          primary: { usedPercent: 65, windowDurationMins: 300, resetsAt: resetAt },
          secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: resetAt + 3600 },
        },
      },
      rateLimitResetCredits: { availableCount: 2, credits: [] },
    });

    expect(parsed?.rate_limits).toHaveLength(2);
    expect(parsed?.rate_limits[1]).toMatchObject({
      id: 'codex-mini-latest',
      name: 'Codex Mini',
      primary: { percent: 65, window_duration_mins: 300 },
    });
    expect(parsed?.banked_resets.available).toBe(2);
  });

  it('parses legacy wham grants and flat usage shapes', () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    const grants = parseWhamResponse({
      grants: [
        { grant_type: 'plus_5h', used: 30, limit: 100, reset_at: resetAt },
        { grant_type: 'plus_weekly', used: 400, limit: 1000, reset_at: resetAt },
      ],
      banked_resets: { available: 2 },
    });
    const flat = parseWhamResponse({
      usage: {
        pro_5h: { used: 12, limit: 100, reset_at: resetAt },
        pro_weekly: { used: 99, limit: 1000, reset_at: resetAt },
      },
      rate_limit_reset_credits: { available_count: '4' },
    });

    expect(grants.window_5h.percent).toBe(30);
    expect(grants.window_weekly.percent).toBe(40);
    expect(grants.banked_resets.available).toBeNull();
    expect(flat.window_5h.percent).toBe(12);
    expect(flat.window_weekly.percent).toBe(9.9);
    expect(flat.banked_resets.available).toBe(4);
  });

  it('parses live WHAM rate_limit.primary_window shape', () => {
    const resetAt = Math.floor(Date.now() / 1000) + 18_000;
    const live = parseWhamResponse({
      plan_type: 'plus',
      rate_limit: {
        allowed: true,
        primary_window: {
          used_percent: 4,
          limit_window_seconds: 18_000,
          reset_at: resetAt,
        },
        secondary_window: {
          used_percent: 23,
          limit_window_seconds: 604_800,
          reset_at: resetAt + 1000,
        },
      },
      rate_limit_reset_credits: { available_count: 0 },
    });

    expect(live.window_5h.percent).toBe(4);
    expect(live.window_5h.window_duration_mins).toBe(300);
    expect(live.window_5h.reset_at_unix).toBe(resetAt);
    expect(live.window_weekly.percent).toBe(23);
    expect(live.window_weekly.window_duration_mins).toBe(10_080);
    expect(live.rate_limits[0].plan_type).toBe('plus');
    expect(live.banked_resets.available).toBe(0);
  });
});

describe('model / quota ranking', () => {
  it('puts models with captured tokens first and drops empty rows', () => {
    const ranked = rankModelsByTokens([
      { model: 'idle', input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, cost_usd: null, percent_of_total: 0 },
      { model: 'gpt-5.6-luna', input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, cost_usd: null, percent_of_total: 10 },
      { model: 'gpt-5.6-sol', input_tokens: 900, cached_input_tokens: 0, output_tokens: 90, cost_usd: null, percent_of_total: 90 },
    ]);
    expect(ranked.map((m) => m.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
  });

  it('ranks rate-limit buckets with token hits ahead of idle ones', () => {
    const mk = (id: string, percent: number): RateLimitBucket => ({
      id,
      name: null,
      primary: { ...EMPTY_WINDOW, limit: 100, percent, used: percent },
      secondary: { ...EMPTY_WINDOW, limit: 100, percent: 0 },
      plan_type: null,
    });
    const ranked = rankRateLimitBuckets(
      [mk('codex-mini-latest', 40), mk('gpt-5.6-sol', 5), mk('legacy-model', 0)],
      ['gpt-5.6-sol'],
    );
    expect(ranked.map((b) => b.id)).toEqual(['gpt-5.6-sol', 'codex-mini-latest', 'legacy-model']);
  });
});

describe('API-equivalent cost estimation', () => {
  it('uses current GPT-5 cached-input pricing', () => {
    const usage: PeriodUsage = {
      messages: 1,
      tokens: 1_100_000,
      models: [{
        model: 'gpt-5',
        input_tokens: 1_000_000,
        cached_input_tokens: 900_000,
        output_tokens: 100_000,
        cost_usd: null,
        percent_of_total: 100,
      }],
    };

    const enriched = enrichWithCosts(usage);

    expect(enriched.models[0].cost_usd).toBe(1.2375);
    expect(computeSpend(enriched, new Date(2026, 6, 11))).toMatchObject({
      month_total_usd: 1.24,
      unpriced_models: [],
      pricing_as_of: '2026-07-11',
    });
  });

  it('prices GPT-5.6 Sol / Luna (current Codex defaults)', () => {
    const usage: PeriodUsage = {
      messages: 2,
      tokens: 2_000_000,
      models: [
        {
          model: 'gpt-5.6-sol',
          input_tokens: 1_000_000,
          cached_input_tokens: 0,
          output_tokens: 100_000,
          cost_usd: null,
          percent_of_total: 50,
        },
        {
          model: 'gpt-5.6-luna',
          input_tokens: 1_000_000,
          cached_input_tokens: 500_000,
          output_tokens: 50_000,
          cost_usd: null,
          percent_of_total: 50,
        },
      ],
    };

    const enriched = enrichWithCosts(usage);
    // Sol: 1M * $5 + 0.1M * $30 = $5 + $3 = $8
    expect(enriched.models[0].cost_usd).toBe(8);
    // Luna: 0.5M uncached * $1 + 0.5M cached * $0.1 + 0.05M * $6
    //      = 0.5 + 0.05 + 0.3 = 0.85
    expect(enriched.models[1].cost_usd).toBe(0.85);
    expect(computeSpend(enriched).unpriced_models).toEqual([]);
  });

  it('matches model suffixes and prefers the longest price id', () => {
    expect(priceFor('gpt-5.3-codex-high')?.id).toBe('gpt-5.3-codex');
    expect(priceFor('gpt-5.4-mini')?.id).toBe('gpt-5.4-mini');
    expect(priceFor('gpt-5.4')?.id).toBe('gpt-5.4');
    expect(priceFor('gpt-5.6-sol')?.id).toBe('gpt-5.6-sol');
  });

  it('does not silently assign a price to an unknown model', () => {
    const usage: PeriodUsage = {
      messages: 1,
      tokens: 10,
      models: [{
        model: 'future-codex-model',
        input_tokens: 8,
        cached_input_tokens: 0,
        output_tokens: 2,
        cost_usd: null,
        percent_of_total: 100,
      }],
    };

    const enriched = enrichWithCosts(usage);
    expect(enriched.models[0].cost_usd).toBeNull();
    expect(computeSpend(enriched).unpriced_models).toEqual(['future-codex-model']);
  });
});
