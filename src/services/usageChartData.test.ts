import { describe, expect, it } from 'vitest';
import type { ModelUsage } from '../types';
import { buildUsageChartData } from './usageChartData';

const model = (name: string, input: number, cached: number, output: number): ModelUsage => ({
  model: name,
  input_tokens: input,
  cached_input_tokens: cached,
  output_tokens: output,
  cost_usd: null,
  percent_of_total: 0,
});

describe('buildUsageChartData', () => {
  it('ranks models from source token totals and limits the displayed rows', () => {
    const result = buildUsageChartData([
      model('small', 20, 0, 10),
      model('large', 100, 0, 80),
      model('middle', 50, 0, 20),
    ], 2);

    expect(result.models.map(({ label, tokens }) => [label, tokens])).toEqual([
      ['large', 180],
      ['middle', 70],
    ]);
  });

  it('separates cached input from uncached input without counting it twice', () => {
    const result = buildUsageChartData([model('gpt-5', 120, 70, 30)]);

    expect(result.composition.map(({ label, value }) => [label, value])).toEqual([
      ['输入', 50],
      ['缓存输入', 70],
      ['输出', 30],
    ]);
  });

  it('clamps invalid negative totals and returns empty data for an empty period', () => {
    expect(buildUsageChartData([])).toEqual({ models: [], composition: [
      { label: '输入', value: 0, color: '#70d7ff' },
      { label: '缓存输入', value: 0, color: '#a79bff' },
      { label: '输出', value: 0, color: '#82e0a1' },
    ] });
    expect(buildUsageChartData([model('bad', -10, -4, -2)]).models).toEqual([]);
  });

  it('caps cached input at the recorded input total', () => {
    expect(buildUsageChartData([model('gpt-5', 12, 40, 5)]).composition.map(({ value }) => value))
      .toEqual([0, 12, 5]);
  });
});
