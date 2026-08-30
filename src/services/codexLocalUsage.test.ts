import { describe, expect, it } from 'vitest';
import { captureCodexLocal } from './codexLocalUsage';
import { LOCAL_TOKEN_SUBTOTAL_STORAGE_KEY, readLocalTokenSubtotalCheckpoint, setLocalTokenSubtotalCheckpoint } from './localTokenSubtotal';
import type { FileApi } from './localFileAccess';

describe('Codex local usage periods', () => {
  it('separates the active quota window from month and lifetime totals', async () => {
    const rolloutPath = '/home/test/.codex/sessions/2026/08/16/rollout-periods.jsonl';
    const files = new Map<string, string>([
      ['/home/test/.codex/auth.json', JSON.stringify({ access_token: 'test-token' })],
      [rolloutPath, [
        JSON.stringify({
          timestamp: '2026-08-16T08:00:00.000Z',
          type: 'turn_context',
          payload: { model: 'gpt-5.6-sol' },
        }),
        tokenCount('2026-08-16T08:01:00.000Z', 80, 20, 100),
        // Exact current-window boundary: belongs to current, never previous.
        tokenCount('2026-08-16T09:00:00.000Z', 96, 24, 120),
        tokenCount('2026-08-16T10:00:00.000Z', 120, 30, 150, {
          used_percent: 12,
          window_minutes: 300,
          resets_at: Date.parse('2026-08-16T14:00:00.000Z') / 1000,
        }),
      ].join('\n')],
    ]);
    const directories = new Map<string, Array<{ entry: string; type: string }>>([
      ['/home/test/.codex', [
        { entry: 'auth.json', type: 'FILE' },
        { entry: 'sessions', type: 'DIRECTORY' },
      ]],
      ['/home/test/.codex/sessions', [{ entry: '2026', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026', [{ entry: '08', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08', [{ entry: '16', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08/16', [{ entry: 'rollout-periods.jsonl', type: 'FILE' }]],
    ]);
    const api: FileApi = {
      readFile: async (path) => {
        const value = files.get(path);
        if (value == null) throw new Error(`missing file: ${path}`);
        return value;
      },
      readDirectory: async (path) => {
        const value = directories.get(path);
        if (value == null) throw new Error(`missing directory: ${path}`);
        return value;
      },
    };

    const usage = await captureCodexLocal(api, '/home/test', new Date('2026-08-16T12:00:00.000Z'));

    expect(usage.current.tokens).toBe(50);
    expect(usage.previous?.tokens).toBe(100);
    expect(usage.month.tokens).toBe(150);
    expect(usage.total.tokens).toBe(150);
    expect(usage.current_period_end).toBe(Date.parse('2026-08-16T14:00:00.000Z') / 1000);
  });

  it('keeps 5h current and previous periods when the 5h duration is omitted', async () => {
    const rolloutPath = '/home/test/.codex/sessions/2026/08/16/rollout-mixed-windows.jsonl';
    const fiveHourReset = Date.parse('2026-08-16T14:00:00.000Z') / 1000;
    const weeklyReset = Date.parse('2026-08-22T00:00:00.000Z') / 1000;
    const files = new Map<string, string>([
      ['/home/test/.codex/auth.json', JSON.stringify({ access_token: 'test-token' })],
      [rolloutPath, [
        JSON.stringify({
          timestamp: '2026-08-16T08:00:00.000Z',
          type: 'turn_context',
          payload: { model: 'gpt-5.6-sol' },
        }),
        tokenCount('2026-08-16T03:30:00.000Z', 56, 14, 70),
        tokenCount('2026-08-16T08:00:00.000Z', 136, 34, 170),
        tokenCount('2026-08-16T09:00:00.000Z', 96, 24, 290),
        // Some rollout payloads omit the 5h duration while retaining its reset.
        tokenCount('2026-08-16T10:00:00.000Z', 120, 30, 440, {
          used_percent: 12,
          resets_at: fiveHourReset,
          window_minutes: null,
        }, {
          used_percent: 4,
          resets_at: weeklyReset,
          window_minutes: 10_080,
        }),
      ].join('\n')],
    ]);
    const directories = new Map<string, Array<{ entry: string; type: string }>>([
      ['/home/test/.codex', [
        { entry: 'auth.json', type: 'FILE' },
        { entry: 'sessions', type: 'DIRECTORY' },
      ]],
      ['/home/test/.codex/sessions', [{ entry: '2026', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026', [{ entry: '08', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08', [{ entry: '16', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08/16', [{ entry: 'rollout-mixed-windows.jsonl', type: 'FILE' }]],
    ]);
    const api: FileApi = {
      readFile: async (path) => {
        const value = files.get(path);
        if (value == null) throw new Error(`missing file: ${path}`);
        return value;
      },
      readDirectory: async (path) => {
        const value = directories.get(path);
        if (value == null) throw new Error(`missing directory: ${path}`);
        return value;
      },
    };

    const usage = await captureCodexLocal(api, '/home/test', new Date('2026-08-16T12:00:00.000Z'));

    expect(usage.current.tokens).toBe(270);
    expect(usage.previous?.tokens).toBe(100);
    expect(usage.current_period_start).toBe(fiveHourReset - 5 * 60 * 60);
    expect(usage.current_period_end).toBe(fiveHourReset);
    expect(usage.current_period_key).toBe(`5h:${fiveHourReset - 5 * 60 * 60}:${fiveHourReset}`);
    expect(usage.previous_period_start).toBe(fiveHourReset - 2 * 5 * 60 * 60);
    expect(usage.previous_period_end).toBe(fiveHourReset - 5 * 60 * 60);
    expect(usage.previous_period_key).toBe(
      `5h:${fiveHourReset - 2 * 5 * 60 * 60}:${fiveHourReset - 5 * 60 * 60}`,
    );
  });

  it('rolls an expired weekly-only period forward in exact 7d increments', async () => {
    const rolloutPath = '/home/test/.codex/sessions/2026/08/31/rollout-weekly-only.jsonl';
    const staleWeeklyReset = Date.parse('2026-08-29T00:00:00.000Z') / 1000;
    const nextWeeklyReset = Date.parse('2026-09-05T00:00:00.000Z') / 1000;
    const weeklyStart = Date.parse('2026-08-29T00:00:00.000Z') / 1000;
    const previousWeeklyStart = Date.parse('2026-08-22T00:00:00.000Z') / 1000;
    const files = new Map<string, string>([
      ['/home/test/.codex/auth.json', JSON.stringify({ access_token: 'test-token' })],
      [rolloutPath, [
        JSON.stringify({
          timestamp: '2026-08-31T08:00:00.000Z',
          type: 'turn_context',
          payload: { model: 'gpt-5.6-sol' },
        }),
        tokenCount('2026-08-28T23:00:00.000Z', 8, 2, 10),
        tokenCount('2026-08-29T00:00:00.000Z', 16, 4, 30),
        // The newest local payload reports only the weekly window, already expired at `now`.
        tokenCount('2026-08-31T11:00:00.000Z', 24, 6, 60, {
          used_percent: 42,
          resets_at: staleWeeklyReset,
          window_minutes: 10_080,
        }),
      ].join('\n')],
    ]);
    const directories = new Map<string, Array<{ entry: string; type: string }>>([
      ['/home/test/.codex', [
        { entry: 'auth.json', type: 'FILE' },
        { entry: 'sessions', type: 'DIRECTORY' },
      ]],
      ['/home/test/.codex/sessions', [{ entry: '2026', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026', [{ entry: '08', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08', [{ entry: '31', type: 'DIRECTORY' }]],
      ['/home/test/.codex/sessions/2026/08/31', [{ entry: 'rollout-weekly-only.jsonl', type: 'FILE' }]],
    ]);
    const api: FileApi = {
      readFile: async (path) => {
        const value = files.get(path);
        if (value == null) throw new Error(`missing file: ${path}`);
        return value;
      },
      readDirectory: async (path) => {
        const value = directories.get(path);
        if (value == null) throw new Error(`missing directory: ${path}`);
        return value;
      },
    };

    const usage = await captureCodexLocal(api, '/home/test', new Date('2026-08-31T12:00:00.000Z'));

    expect(usage.current.tokens).toBe(50);
    expect(usage.previous?.tokens).toBe(10);
    expect(usage.current_period_start).toBe(weeklyStart);
    expect(usage.current_period_end).toBe(nextWeeklyReset);
    expect(usage.current_period_key).toBe(`7d:${weeklyStart}:${nextWeeklyReset}`);
    expect(usage.previous_period_start).toBe(previousWeeklyStart);
    expect(usage.previous_period_end).toBe(weeklyStart);
    expect(usage.previous_period_key).toBe(`7d:${previousWeeklyStart}:${weeklyStart}`);
  });

  it('persists a local-only subtotal checkpoint without touching session data', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    setLocalTokenSubtotalCheckpoint(1_723_811_200, storage);

    expect(readLocalTokenSubtotalCheckpoint(storage)).toBe(1_723_811_200);
    expect(values.get(LOCAL_TOKEN_SUBTOTAL_STORAGE_KEY)).toContain('checkpoint_unix');
  });
});

function tokenCount(
  timestamp: string,
  input: number,
  output: number,
  total: number,
  primary?: Record<string, number | null>,
  secondary?: Record<string, number | null>,
) {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: 0,
          output_tokens: output,
          total_tokens: total,
        },
      },
      rate_limits: primary ? { primary, secondary } : undefined,
    },
  });
}
