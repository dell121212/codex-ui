import { describe, expect, it } from 'vitest';
import {
  buildMistralTokenQuota,
  extractMistralApiKey,
  loadGrokAccessToken,
  parseGrokBillingResponses,
  parseGrokSummary,
  parseGrokSignals,
  parseGrokUpdatesFile,
  parseMistralRateLimitHeaders,
  parseVibeActiveModel,
  parseVibeSessionMeta,
  parseVibeWhoAmI,
} from './localProviders';

describe('Grok local + official billing', () => {
  it('counts prompts for activity but never treats context cursor as billed tokens', () => {
    // totalTokens is a context-window cursor — must not become API usage.
    const lines = [
      metaLine('p1', 1000, 1),
      metaLine('p1', 3000, 2),
      metaLine('p2', 3000, 3),
      metaLine('p2', 5000, 4),
    ];
    const parsed = parseGrokUpdatesFile(lines.join('\n'));
    expect(parsed.messages).toBe(2);
    expect(parsed.tokens).toBe(0);
  });

  it('reads model and timestamps from summary.json', () => {
    const summary = parseGrokSummary(JSON.stringify({
      current_model_id: 'grok-4.5',
      created_at: '2026-07-11T10:00:00Z',
      updated_at: '2026-07-11T12:00:00Z',
    }));
    expect(summary.model).toBe('grok-4.5');
    expect(summary.updatedAt?.toISOString()).toContain('2026-07-11');
  });

  it('reads context size from signals without calling it billed tokens', () => {
    const signals = parseGrokSignals(JSON.stringify({
      contextTokensUsed: 173591,
      modelsUsed: ['grok-4.5'],
      primaryModelId: 'grok-4.5',
      turnCount: 12,
    }));
    expect(signals.contextTokens).toBe(173591);
    expect(signals.turns).toBe(12);
    expect(signals.models).toEqual(['grok-4.5']);
  });

  it('parses official Grok billing credits + monthly credit units', () => {
    const now = Math.floor(Date.parse('2026-07-12T00:00:00Z') / 1000);
    const remote = parseGrokBillingResponses(
      {
        config: {
          creditUsagePercent: 64,
          currentPeriod: {
            type: 'USAGE_PERIOD_TYPE_WEEKLY',
            start: '2026-07-11T04:06:08.870466+00:00',
            end: '2026-07-18T04:06:08.870466+00:00',
          },
          productUsage: [
            { product: 'GrokBuild', usagePercent: 61 },
            { product: 'GrokChat', usagePercent: 3 },
          ],
        },
      },
      {
        config: {
          monthlyLimit: { val: 15000 },
          used: { val: 2505 },
          billingPeriodStart: '2026-07-01T00:00:00+00:00',
          billingPeriodEnd: '2026-08-01T00:00:00+00:00',
        },
      },
      now,
    );

    expect(remote.primary.percent).toBe(64);
    expect(remote.primary.window_duration_mins).toBe(10_080);
    // secondary is monthly credit units (official /v1/billing), not product %
    expect(remote.secondary.used).toBe(2505);
    expect(remote.secondary.limit).toBe(15000);
    expect(remote.secondary.percent).toBe(16.7);
    expect(remote.products).toEqual([
      { product: 'GrokBuild', percent: 61 },
      { product: 'GrokChat', percent: 3 },
    ]);
    expect(remote.monthly).toMatchObject({ used: 2505, limit: 15000 });
    expect(remote.primary_label).toBe('周额度');
  });

  it('loads Grok OIDC access token from auth.json map', () => {
    const tok = loadGrokAccessToken({
      'https://auth.x.ai::client': {
        key: 'eyJhbGciOi.test',
        email: 'a@b.com',
        expires_at: '2026-07-12T08:00:00Z',
      },
    });
    expect(tok?.token).toBe('eyJhbGciOi.test');
    expect(tok?.email).toBe('a@b.com');
  });
});

describe('Mistral Vibe local session meta', () => {
  it('parses session_prompt_tokens / completion / cost / context', () => {
    const parsed = parseVibeSessionMeta(JSON.stringify({
      start_time: '2026-07-11T10:00:00Z',
      end_time: '2026-07-11T12:00:00Z',
      total_messages: 12,
      stats: {
        session_prompt_tokens: 1000,
        session_completion_tokens: 200,
        session_total_llm_tokens: 1200,
        context_tokens: 92564,
        session_cost: 0.42,
      },
      config: { active_model: 'mistral-medium-3.5' },
    }));
    expect(parsed).toMatchObject({
      model: 'mistral-medium-3.5',
      input: 1000,
      output: 200,
      tokens: 1200,
      contextTokens: 92564,
      cost: 0.42,
      messages: 12,
    });
  });

  it('builds monthly token quota from official rate-limit headers', () => {
    const headers = [
      'HTTP/2 200',
      'x-ratelimit-limit-tokens-month: 4000000',
      'x-ratelimit-remaining-tokens-month: 1000000',
      'x-ratelimit-limit-tokens-minute: 50000',
      'x-ratelimit-remaining-tokens-minute: 40000',
    ].join('\n');
    const limits = parseMistralRateLimitHeaders(headers);
    expect(limits).toMatchObject({
      monthLimit: 4_000_000,
      monthRemaining: 1_000_000,
      minuteLimit: 50_000,
      minuteRemaining: 40_000,
    });
    const q = buildMistralTokenQuota({
      localMonthTokens: 12,
      limits,
      planLabel: 'API Free',
    });
    expect(q.primary_label).toBe('月 Token');
    expect(q.primary.used).toBe(3_000_000);
    expect(q.primary.limit).toBe(4_000_000);
    expect(q.primary.percent).toBe(75);
    expect(q.secondary.limit).toBe(50_000);
    expect(q.secondary.used).toBe(10_000);
    expect(q.monthly).toMatchObject({ used: 3_000_000, limit: 4_000_000 });
  });

  it('falls back to local month tokens when free model has no month cap', () => {
    const q = buildMistralTokenQuota({
      localMonthTokens: 42_000,
      limits: {
        monthLimit: null,
        monthRemaining: null,
        minuteLimit: 500_000,
        minuteRemaining: 499_000,
        queryCost: 17,
      },
      planLabel: 'API Free',
    });
    expect(q.primary_label).toBe('月 Token');
    expect(q.primary.used).toBe(42_000);
    expect(q.primary.limit).toBe(0);
    expect(q.secondary.limit).toBe(500_000);
    expect(q.monthly).toBeUndefined();
  });

  it('parses whoami plan labels and active_model', () => {
    expect(parseVibeWhoAmI({ plan_type: 'CHAT', plan_name: 'Pro' })?.plan_label).toContain('Pro');
    expect(parseVibeWhoAmI({ plan_type: 'API', plan_name: 'FREE' })?.plan_label).toBe('API Free');
    expect(parseVibeActiveModel('active_model = "mistral-medium-3.5"\n')).toBe('mistral-medium-3.5');
  });

  it('extracts API key with quotes stripped', () => {
    expect(extractMistralApiKey("MISTRAL_API_KEY='abc123'\n")).toBe('abc123');
  });
});

function metaLine(promptId: string, totalTokens: number, ts: number): string {
  return JSON.stringify({
    timestamp: ts,
    params: {
      _meta: {
        promptId,
        totalTokens,
        agentTimestampMs: ts * 1000,
      },
      update: { sessionUpdate: 'tool_call' },
    },
  });
}
