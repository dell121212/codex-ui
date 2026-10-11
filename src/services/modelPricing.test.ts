import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MODEL_PRICING_REFRESH_MS,
  MODEL_PRICING_STORAGE_KEY,
  parseOpenAiGptPrices,
  refreshModelPricing,
} from './modelPricing';
import { estimateModelCost, pricingAsOf } from './usageLogic';

describe('automatic GPT price updates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses OpenAI GPT rates only and converts them to per-million prices', () => {
    expect(parseOpenAiGptPrices({
      'gpt-6-new': {
        litellm_provider: 'openai', mode: 'chat', input_cost_per_token: 0.000002,
        cache_read_input_token_cost: 0.0000002, cache_creation_input_token_cost: 0.0000025,
        output_cost_per_token: 0.00001,
      },
      'azure/gpt-6-new': {
        litellm_provider: 'azure', mode: 'chat', input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000001,
      },
      'gpt-6-image': {
        litellm_provider: 'openai', mode: 'image_generation', input_cost_per_token: 0,
        output_cost_per_token: 0,
      },
    })).toEqual([{
      id: 'gpt-6-new', input: 2, cached: 0.2, cacheCreation: 2.5, output: 10,
    }]);
  });

  it('fetches once, caches rates, and skips checks for 24 hours', async () => {
    const values = new Map<string, string>();
    const storage = {
      getData: vi.fn(async (key: string) => values.get(key) ?? ''),
      setData: vi.fn(async (key: string, value?: string | null) => {
        if (value !== undefined && value !== null) values.set(key, value);
      }),
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      'gpt-6-new': {
        litellm_provider: 'openai', mode: 'chat', input_cost_per_token: 0.000002,
        cache_read_input_token_cost: 0.0000002, output_cost_per_token: 0.00001,
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    expect(await refreshModelPricing(storage)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(values.get(MODEL_PRICING_STORAGE_KEY) ?? '{}').prices).toHaveLength(1);
    expect(estimateModelCost({ model: 'gpt-6-new-high', input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 0 })?.totalUsd).toBe(2);
    expect(pricingAsOf()).toBe(new Date().toISOString().slice(0, 10));

    expect(await refreshModelPricing(storage)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(MODEL_PRICING_REFRESH_MS).toBe(24 * 60 * 60 * 1000);
  });
});
