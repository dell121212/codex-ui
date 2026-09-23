import type { ModelUsage } from '../types';

export interface UsageChartModel {
  label: string;
  tokens: number;
  color: string;
}

export interface UsageChartSegment {
  label: string;
  value: number;
  color: string;
}

const MODEL_COLORS = ['#70d7ff', '#82e0a1', '#a79bff', '#ffbd75', '#ff8c9e', '#6fe0d2'];
const TOKEN_COLORS = ['#70d7ff', '#a79bff', '#82e0a1'];

export function buildUsageChartData(models: ModelUsage[], modelLimit = 6): {
  models: UsageChartModel[];
  composition: UsageChartSegment[];
} {
  const ranked = [...models]
    .map((model) => ({ model, tokens: Math.max(0, model.input_tokens) + Math.max(0, model.output_tokens) }))
    .filter(({ tokens }) => Number.isFinite(tokens) && tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.model.model.localeCompare(b.model.model));

  const totals = models.reduce((sum, model) => {
    const input = Math.max(0, Number.isFinite(model.input_tokens) ? model.input_tokens : 0);
    const cached = Math.min(input, Math.max(0, Number.isFinite(model.cached_input_tokens) ? model.cached_input_tokens : 0));
    sum.input += input - cached;
    sum.cached += cached;
    sum.output += Math.max(0, Number.isFinite(model.output_tokens) ? model.output_tokens : 0);
    return sum;
  }, { input: 0, cached: 0, output: 0 });
  const compositionValues = [
    { label: '输入', value: totals.input },
    { label: '缓存输入', value: totals.cached },
    { label: '输出', value: totals.output },
  ];

  return {
    models: ranked.slice(0, Math.max(0, modelLimit)).map(({ model, tokens }, index) => ({
      label: model.model,
      tokens,
      color: MODEL_COLORS[index % MODEL_COLORS.length],
    })),
    composition: compositionValues.map((segment, index) => ({
      ...segment,
      color: TOKEN_COLORS[index],
    })),
  };
}
