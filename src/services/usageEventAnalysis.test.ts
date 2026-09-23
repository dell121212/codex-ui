import { describe, expect, it } from 'vitest';
import type { UsageEvent } from '../types';
import { analyzeUsageEvents } from './usageEventAnalysis';

const event = (
  timestamp: string,
  patch: Partial<UsageEvent> = {},
): UsageEvent => ({
  timestamp: timestamp,
  timestamp_unix: Date.parse(timestamp) / 1000,
  timestamp_unix_ms: Date.parse(timestamp),
  model: 'gpt-5',
  input_tokens: 100,
  cached_input_tokens: 20,
  output_tokens: 50,
  total_tokens: 150,
  session_id: 'session-a',
  project_path: '/workspace/a',
  cost_usd: 0.02,
  ...patch,
});

describe('analyzeUsageEvents', () => {
  it('filters by inclusive local calendar dates and supports project/model/session filters', () => {
    const source = [
      event('2026-09-22T23:59:59.999Z'),
      event('2026-09-23T00:00:00.000Z', { session_id: 'session-b', project_path: '/workspace/b' }),
      event('2026-09-24T00:00:00.000Z'),
    ];
    const result = analyzeUsageEvents(source, {
      from: new Date(2026, 8, 23),
      to: new Date(2026, 8, 23),
      project: '/workspace/b',
      model: 'gpt-5',
      session: 'session-b',
    });

    expect(result.events).toHaveLength(1);
    expect(result.tokens).toBe(150);
    expect(result.projects[0]?.id).toBe('/workspace/b');
  });

  it('keeps unpriced usage visible and attributes child-session cost to its parent agent', () => {
    const result = analyzeUsageEvents([
      event('2026-09-23T10:00:00.000Z', { parent_session_id: 'parent', cost_usd: 0.03 }),
      event('2026-09-23T10:01:00.000Z', { session_id: 'session-b', parent_session_id: 'parent', cost_usd: null, total_tokens: 25 }),
    ], { from: new Date(2026, 8, 23), to: new Date(2026, 8, 23) });

    expect(result.agents).toMatchObject([{ id: 'parent', events: 2, sessions: 2, costUsd: 0.03, pricedEvents: 1, hasUnpriced: true }]);
    expect(result.hasUnpriced).toBe(true);
    expect(result.pricedEvents).toBe(1);
    expect(result.days[0]?.tokens).toBe(175);
  });

  it('does not present missing prices as a zero-dollar estimate', () => {
    const result = analyzeUsageEvents([
      event('2026-09-23T10:00:00.000Z', { cost_usd: null }),
    ], { from: new Date(2026, 8, 23), to: new Date(2026, 8, 23) });
    expect(result.pricedEvents).toBe(0);
    expect(result.costUsd).toBe(0);
    expect(result.hasUnpriced).toBe(true);
  });
});
