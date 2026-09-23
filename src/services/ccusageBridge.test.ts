import { describe, expect, it } from 'vitest';
import { parseCcusageBridgeResponse } from './ccusageBridge';

describe('ccusage raw-event contract', () => {
  it('preserves millisecond timestamps and session metadata for analysis', () => {
    const parsed = parseCcusageBridgeResponse(JSON.stringify({
      schemaVersion: 4,
      engine: 'ccusage-rust-codex-adapter',
      scannedAt: '2026-09-23T09:10:11.123Z',
      filesScanned: 2,
      cacheHit: true,
      summary: {
        today: { messages: 1, tokens: 150, models: [{ model: 'gpt-5', inputTokens: 120, cachedInputTokens: 40, cacheCreationTokens: 5, outputTokens: 30 }] },
        current: { messages: 1, tokens: 150, models: [{ model: 'gpt-5', inputTokens: 120, cachedInputTokens: 40, cacheCreationTokens: 5, outputTokens: 30 }] },
        previous: { messages: 0, tokens: 0, models: [] },
        month: { messages: 1, tokens: 150, models: [{ model: 'gpt-5', inputTokens: 120, cachedInputTokens: 40, cacheCreationTokens: 5, outputTokens: 30 }] },
        total: { messages: 1, tokens: 150, models: [{ model: 'gpt-5', inputTokens: 120, cachedInputTokens: 40, cacheCreationTokens: 5, outputTokens: 30 }] },
        subtotal: { messages: 1, tokens: 150, models: [{ model: 'gpt-5', inputTokens: 120, cachedInputTokens: 40, cacheCreationTokens: 5, outputTokens: 30 }] },
        daily: [{ day: '2026-09-23', tokens: 150 }],
      },
      events: [{
        sessionId: '2026/09/23/rollout-example',
        timestamp: '2026-09-23T09:10:11.123Z',
        model: 'gpt-5',
        inputTokens: 120,
        cachedInputTokens: 40,
        cacheCreationTokens: 5,
        outputTokens: 30,
        reasoningOutputTokens: 12,
        totalTokens: 150,
        serviceTier: 'fast',
        projectPath: '/workspace/project',
        parentSessionId: 'parent-thread',
      }],
    }));

    expect(parsed.cacheHit).toBe(true);
    expect(parsed.filesScanned).toBe(2);
    expect(parsed.events[0]).toMatchObject({
      timestamp_unix_ms: Date.parse('2026-09-23T09:10:11.123Z'),
      session_id: '2026/09/23/rollout-example',
      project_path: '/workspace/project',
      parent_session_id: 'parent-thread',
      cache_creation_tokens: 5,
      reasoning_output_tokens: 12,
      service_tier: 'fast',
    });
  });

  it('rejects unknown schema versions instead of silently dropping event detail', () => {
    expect(() => parseCcusageBridgeResponse(JSON.stringify({
      schemaVersion: 4,
      engine: 'other',
      summary: { today: { messages: 0, tokens: 0, models: [] }, current: { messages: 0, tokens: 0, models: [] }, previous: { messages: 0, tokens: 0, models: [] }, month: { messages: 0, tokens: 0, models: [] }, total: { messages: 0, tokens: 0, models: [] }, subtotal: { messages: 0, tokens: 0, models: [] }, daily: [] },
      events: [],
    }))).toThrow('unsupported event contract');
  });
});
