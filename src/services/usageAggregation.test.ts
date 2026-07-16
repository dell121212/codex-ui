import { describe, expect, it } from 'vitest';
import type { PeriodUsage, ProviderLocalUsage, UsageSnapshot } from '../types';
import { aggregatePeriods, buildUsagePortfolio } from './usageAggregation';

function period(tokens: number, messages: number, model: string, cost: number | null): PeriodUsage {
  return {
    tokens,
    messages,
    models: [{
      model,
      input_tokens: Math.round(tokens * 0.8),
      cached_input_tokens: Math.round(tokens * 0.2),
      output_tokens: Math.round(tokens * 0.2),
      cost_usd: cost,
      percent_of_total: 100,
    }],
  };
}

describe('multi-provider usage aggregation', () => {
  it('merges messages, tokens and identical model names', () => {
    const merged = aggregatePeriods([
      period(1_000, 2, 'shared-model', 1),
      period(2_000, 3, 'shared-model', 2),
    ]);

    expect(merged).toMatchObject({ tokens: 3_000, messages: 5 });
    expect(merged.models).toHaveLength(1);
    expect(merged.models[0]).toMatchObject({
      model: 'shared-model',
      cost_usd: 3,
    });
  });

  it('uses the snapshot Codex period once and aggregates every provider', () => {
    const codex = period(1_000, 4, 'gpt-5', 5);
    const claude = period(2_000, 6, 'claude-sonnet', 3);
    const data = {
      today_local: codex,
      month_local: codex,
      spend: {
        month_total_usd: 5,
        avg_daily_usd: 1,
        projected_usd: 10,
        unpriced_models: [],
        pricing_as_of: '2026-07-16',
      },
    } as unknown as UsageSnapshot;
    const providers = [
      {
        provider: 'codex',
        available: true,
        hasTokens: true,
        today: codex,
        month: codex,
      },
      {
        provider: 'claude',
        available: true,
        hasTokens: true,
        today: claude,
        month: claude,
      },
    ] as ProviderLocalUsage[];

    const portfolio = buildUsagePortfolio(data, providers);

    expect(portfolio.month.tokens).toBe(3_000);
    expect(portfolio.month.messages).toBe(10);
    expect(portfolio.providers.find((provider) => provider.id === 'codex')?.monthShare)
      .toBeCloseTo(33.33, 1);
    expect(portfolio.activeProviders).toBe(2);
  });
});
