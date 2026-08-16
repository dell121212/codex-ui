import type { PeriodUsage, ProviderLocalUsage } from '../types';

export function mergeStableLocalProviders(
  fresh: ProviderLocalUsage[],
  previous: ProviderLocalUsage[] | undefined,
  freshAt: string,
  previousAt?: string,
): ProviderLocalUsage[] {
  if (!previous?.length || !previousAt) return fresh;

  const previousByProvider = new Map(previous.map((provider) => [provider.provider, provider]));
  const sameDay = isSameLocalDay(freshAt, previousAt);
  const sameMonth = isSameLocalMonth(freshAt, previousAt);

  return fresh.map((provider) => {
    const before = previousByProvider.get(provider.provider);
    if (!before) return provider;
    const previousCurrent = before.current ?? before.month;
    const previousTotal = before.total ?? before.month;

    const sameCurrentPeriod = provider.current_period_end != null
      && provider.current_period_end === before.current_period_end;
    const current = sameCurrentPeriod || (provider.current_period_end == null && sameDay)
      ? nonRegressingPeriod(provider.current, previousCurrent)
      : provider.current;
    const today = sameDay
      ? nonRegressingPeriod(provider.today, before.today)
      : provider.today;
    const month = sameMonth
      ? nonRegressingPeriod(provider.month, before.month)
      : provider.month;
    const total = nonRegressingPeriod(provider.total, previousTotal);

    return {
      ...provider,
      hasTokens: current.tokens > 0 || month.tokens > 0 || total.tokens > 0,
      today,
      current,
      month,
      total,
    };
  });
}

function nonRegressingPeriod(fresh: PeriodUsage, previous: PeriodUsage): PeriodUsage {
  if (fresh.tokens < previous.tokens) return previous;
  if (fresh.tokens === previous.tokens && fresh.messages < previous.messages) return previous;
  return fresh;
}

function isSameLocalDay(left: string, right: string): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isSameLocalMonth(left: string, right: string): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
