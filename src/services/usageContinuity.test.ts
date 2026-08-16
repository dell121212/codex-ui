import { describe, expect, it } from 'vitest';
import type { PeriodUsage, ProviderLocalUsage } from '../types';
import { mergeStableLocalProviders } from './usageContinuity';

type UsageWithPeriods = ProviderLocalUsage & {
  current: PeriodUsage;
  total: PeriodUsage;
  current_period_end?: number;
};

function period(tokens: number): PeriodUsage {
  return { tokens, messages: tokens > 0 ? 1 : 0, models: [] };
}

function provider(tokens: number, currentPeriodEnd = 1_800_000_000): UsageWithPeriods {
  return {
    provider: 'codex',
    available: true,
    hasTokens: tokens > 0,
    today: period(tokens),
    current: period(tokens),
    month: period(tokens),
    total: period(tokens),
    current_period_end: currentPeriodEnd,
  };
}

describe('local usage continuity', () => {
  it('keeps the last good counters when a same-period scan temporarily returns zero', () => {
    const previous = provider(120);
    const fresh = provider(0);

    const [merged] = mergeStableLocalProviders(
      [fresh],
      [previous],
      '2026-08-16T08:00:00.000Z',
      '2026-08-16T07:59:00.000Z',
    ) as UsageWithPeriods[];

    expect(merged.today.tokens).toBe(120);
    expect(merged.current.tokens).toBe(120);
    expect(merged.month.tokens).toBe(120);
    expect(merged.total.tokens).toBe(120);
  });

  it('accepts a new calendar-period zero but keeps lifetime totals monotonic', () => {
    const previous = provider(120, 1_800_000_000);
    const fresh = provider(0, 1_900_000_000);

    const [merged] = mergeStableLocalProviders(
      [fresh],
      [previous],
      '2026-09-01T00:01:00.000+08:00',
      '2026-08-31T23:59:00.000+08:00',
    ) as UsageWithPeriods[];

    expect(merged.today.tokens).toBe(0);
    expect(merged.current.tokens).toBe(0);
    expect(merged.month.tokens).toBe(0);
    expect(merged.total.tokens).toBe(120);
  });
});
