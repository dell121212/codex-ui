import type { ModelPrice } from './usageLogic';
import { installModelPrices } from './usageLogic';

export const MODEL_PRICING_STORAGE_KEY = 'model_pricing_v1';
export const MODEL_PRICING_SOURCE = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
export const MODEL_PRICING_REFRESH_MS = 24 * 60 * 60 * 1000;

interface PricingCache {
  checkedAt: number;
  asOf: string;
  prices: ModelPrice[];
}

export function parseOpenAiGptPrices(raw: unknown): ModelPrice[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const prices: ModelPrice[] = [];
  for (const [id, candidate] of Object.entries(raw)) {
    if (!/^gpt-[a-z0-9][a-z0-9.-]*$/i.test(id) || !candidate || typeof candidate !== 'object') continue;
    const entry = candidate as Record<string, unknown>;
    if (entry.litellm_provider !== 'openai' || entry.mode !== 'chat') continue;
    const input = perMillion(entry.input_cost_per_token);
    const output = perMillion(entry.output_cost_per_token);
    if (input === null || output === null) continue;
    const cached = perMillion(entry.cache_read_input_token_cost) ?? input;
    const cacheCreation = perMillion(entry.cache_creation_input_token_cost);
    prices.push({ id: id.toLowerCase(), input, cached, output, ...(cacheCreation === null ? {} : { cacheCreation }) });
  }
  return prices;
}

function perMillion(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1_000_000 * 1e8) / 1e8
    : null;
}

function validCache(value: unknown): value is PricingCache {
  if (!value || typeof value !== 'object') return false;
  const cache = value as Partial<PricingCache>;
  return typeof cache.checkedAt === 'number' && Number.isFinite(cache.checkedAt)
    && typeof cache.asOf === 'string'
    && Array.isArray(cache.prices)
    && cache.prices.length > 0
    && cache.prices.every((price) => price && /^gpt-[a-z0-9][a-z0-9.-]*$/i.test(price.id)
      && [price.input, price.cached, price.output].every((rate) => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0));
}

/** Reuse cached prices and check upstream at most once per day. */
export async function refreshModelPricing(storage: Pick<NeutralinoApi['storage'], 'getData' | 'setData'>): Promise<boolean> {
  let cache: PricingCache | null = null;
  try {
    const stored = await storage.getData(MODEL_PRICING_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (validCache(parsed)) cache = parsed;
    }
  } catch {
    // A bad cache is ignored; the built-in price table remains available.
  }

  if (cache) installModelPrices(cache.prices, cache.asOf);
  if (cache && Date.now() - cache.checkedAt < MODEL_PRICING_REFRESH_MS) return false;

  try {
    const response = await fetch(MODEL_PRICING_SOURCE, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return false;
    const prices = parseOpenAiGptPrices(await response.json() as unknown);
    if (!prices.length) return false;
    const updated: PricingCache = {
      checkedAt: Date.now(),
      asOf: new Date().toISOString().slice(0, 10),
      prices,
    };
    installModelPrices(prices, updated.asOf);
    try {
      await storage.setData(MODEL_PRICING_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // The fresh in-memory prices still apply if persistent storage is unavailable.
    }
    return true;
  } catch {
    return false;
  }
}
