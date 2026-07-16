import type {
  AgentId,
  ModelUsage,
  PeriodUsage,
  ProviderLocalUsage,
  SpendInfo,
  UsageSnapshot,
} from '../types';
import { agentMeta, COMPANY_LIST } from './agentCatalog';
import { computeSpend, modelTokenTotal } from './usageLogic';

export interface ProviderUsageSlice {
  id: AgentId;
  label: string;
  fullName: string;
  badge: string;
  color: string;
  available: boolean;
  today: PeriodUsage;
  month: PeriodUsage;
  spend: SpendInfo;
  monthShare: number;
}

export interface UsagePortfolio {
  today: PeriodUsage;
  month: PeriodUsage;
  spend: SpendInfo;
  providers: ProviderUsageSlice[];
  activeProviders: number;
}

const EMPTY_PERIOD: PeriodUsage = {
  messages: 0,
  tokens: 0,
  models: [],
};

export function aggregatePeriods(periods: PeriodUsage[]): PeriodUsage {
  const models = new Map<string, {
    input: number;
    cached: number;
    output: number;
    cost: number;
    fullyPriced: boolean;
  }>();

  for (const period of periods) {
    for (const model of period.models) {
      const current = models.get(model.model) ?? {
        input: 0,
        cached: 0,
        output: 0,
        cost: 0,
        fullyPriced: true,
      };
      current.input += model.input_tokens;
      current.cached += model.cached_input_tokens;
      current.output += model.output_tokens;
      current.fullyPriced = current.fullyPriced && model.cost_usd !== null;
      current.cost += model.cost_usd ?? 0;
      models.set(model.model, current);
    }
  }

  const merged: ModelUsage[] = [...models.entries()].map(([model, usage]) => ({
    model,
    input_tokens: usage.input,
    cached_input_tokens: usage.cached,
    output_tokens: usage.output,
    cost_usd: usage.fullyPriced ? usage.cost : null,
    percent_of_total: 0,
  }));
  const modelTotal = merged.reduce((total, model) => total + modelTokenTotal(model), 0);
  for (const model of merged) {
    model.percent_of_total = modelTotal > 0 ? (modelTokenTotal(model) / modelTotal) * 100 : 0;
  }

  return {
    messages: periods.reduce((total, period) => total + period.messages, 0),
    tokens: periods.reduce((total, period) => total + period.tokens, 0),
    models: merged,
  };
}

export function buildUsagePortfolio(
  data: UsageSnapshot | null,
  localProviders: ProviderLocalUsage[],
): UsagePortfolio {
  const byProvider = new Map(localProviders.map((provider) => [provider.provider, provider]));
  const base = COMPANY_LIST.map((id) => {
    const meta = agentMeta(id);
    const local = byProvider.get(id);
    const today = id === 'codex' ? data?.today_local ?? EMPTY_PERIOD : local?.today ?? EMPTY_PERIOD;
    const month = id === 'codex' ? data?.month_local ?? EMPTY_PERIOD : local?.month ?? EMPTY_PERIOD;
    const spend = id === 'codex' && data?.spend ? data.spend : computeSpend(month);
    return {
      id,
      label: meta.label,
      fullName: meta.fullName,
      badge: meta.badge,
      color: meta.color,
      available: id === 'codex'
        ? Boolean(data || local?.available || local?.authOk)
        : Boolean(local?.available || local?.authOk || local?.remote),
      today,
      month,
      spend,
    };
  });

  const today = aggregatePeriods(base.map((provider) => provider.today));
  const month = aggregatePeriods(base.map((provider) => provider.month));
  const monthTotal = month.tokens;
  const providers = base
    .map((provider) => ({
      ...provider,
      monthShare: monthTotal > 0 ? (provider.month.tokens / monthTotal) * 100 : 0,
    }))
    .sort((a, b) => b.month.tokens - a.month.tokens);

  return {
    today,
    month,
    spend: {
      month_total_usd: roundMoney(base.reduce((total, provider) => total + provider.spend.month_total_usd, 0)),
      avg_daily_usd: roundMoney(base.reduce((total, provider) => total + provider.spend.avg_daily_usd, 0)),
      projected_usd: roundMoney(base.reduce((total, provider) => total + provider.spend.projected_usd, 0)),
      unpriced_models: base.flatMap((provider) => (
        provider.spend.unpriced_models.map((model) => `${provider.label}: ${model}`)
      )),
      pricing_as_of: data?.spend.pricing_as_of ?? new Date().toISOString().slice(0, 10),
    },
    providers,
    activeProviders: providers.filter((provider) => (
      provider.available || provider.today.tokens > 0 || provider.month.tokens > 0
    )).length,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
