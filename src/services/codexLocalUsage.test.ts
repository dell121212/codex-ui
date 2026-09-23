import { describe, expect, it } from 'vitest';
import { captureCodexLocal } from './codexLocalUsage';
import { mergeStableLocalProviders } from './usageContinuity';
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
        tokenCount('2026-08-15T13:00:00.000Z', 80, 20, 100),
        // Exact current-window boundary: belongs to current, never previous.
        tokenCount('2026-08-15T14:00:00.000Z', 96, 24, 120),
        tokenCount('2026-08-16T10:00:00.000Z', 120, 30, 150, {
          used_percent: 4,
          window_minutes: 10_080,
          resets_at: Date.parse('2026-08-22T14:00:00.000Z') / 1000,
        }, {
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
    expect(usage.current_period_start).toBe(Date.parse('2026-08-15T14:00:00.000Z') / 1000);
    expect(usage.current_period_end).toBe(Date.parse('2026-08-22T14:00:00.000Z') / 1000);
    expect(usage.current_period_key).toBe(
      `7d:${Date.parse('2026-08-15T14:00:00.000Z') / 1000}:${Date.parse('2026-08-22T14:00:00.000Z') / 1000}`,
    );

    const compatibility = await captureCodexLocal(
      api,
      '/home/test',
      new Date('2026-08-16T12:00:00.000Z'),
      { events: [], engine: 'typescript-compatibility' },
    );
    expect(compatibility.total.tokens).toBe(150);
    expect(compatibility.current_period_start).toBe(usage.current_period_start);

    const rust = await captureCodexLocal(
      api,
      '/home/test',
      new Date('2026-08-16T12:00:00.000Z'),
      {
        engine: 'ccusage-rust',
        events: [{
          timestamp: '2026-08-16T10:00:00.000Z',
          timestamp_unix: Date.parse('2026-08-16T10:00:00.000Z') / 1000,
          model: 'gpt-5.6-sol',
          input_tokens: 100,
          cached_input_tokens: 0,
          output_tokens: 50,
          total_tokens: 150,
        }],
        latestRateLimits: {
          timestamp_unix: Date.parse('2026-08-16T10:00:00.000Z') / 1000,
          primary: {
            used: 4,
            limit: 100,
            percent: 4,
            window_duration_mins: 10_080,
            reset_at_unix: Date.parse('2026-08-22T14:00:00.000Z') / 1000,
            remaining_secs: 6 * 24 * 60 * 60 + 4 * 60 * 60,
          },
          secondary: {
            used: 12,
            limit: 100,
            percent: 12,
            window_duration_mins: 300,
            reset_at_unix: Date.parse('2026-08-16T14:00:00.000Z') / 1000,
            remaining_secs: 4 * 60 * 60,
          },
        },
      },
    );
    expect(rust.total.tokens).toBe(150);
    expect(rust.current_period_start).toBe(usage.current_period_start);
  });

  it('prefers an explicit weekly window over a short window when durations are mixed', async () => {
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

    const weeklyStart = weeklyReset - 7 * 24 * 60 * 60;
    expect(usage.current.tokens).toBe(440);
    expect(usage.previous?.tokens).toBe(0);
    expect(usage.current_period_start).toBe(weeklyStart);
    expect(usage.current_period_end).toBe(weeklyReset);
    expect(usage.current_period_key).toBe(`7d:${weeklyStart}:${weeklyReset}`);
    expect(usage.previous_period_start).toBe(weeklyStart - 7 * 24 * 60 * 60);
    expect(usage.previous_period_end).toBe(weeklyStart);
    expect(usage.previous_period_key).toBe(
      `7d:${weeklyStart - 7 * 24 * 60 * 60}:${weeklyStart}`,
    );
  });

  it('falls back to rolling seven-day periods when only a short window is available', async () => {
    const rolloutPath = '/home/test/.codex/sessions/2026/08/31/rollout-short-only.jsonl';
    const now = new Date('2026-09-01T12:00:00.000Z');
    const currentStart = Date.parse('2026-08-25T12:00:00.000Z') / 1000;
    const files = new Map<string, string>([
      ['/home/test/.codex/auth.json', JSON.stringify({ access_token: 'test-token' })],
      [rolloutPath, [
        JSON.stringify({
          timestamp: '2026-08-31T08:00:00.000Z',
          type: 'turn_context',
          payload: { model: 'gpt-5.6-sol' },
        }),
        tokenCount('2026-08-18T11:00:00.000Z', 8, 2, 10),
        tokenCount('2026-08-18T12:00:00.000Z', 16, 4, 30),
        tokenCount('2026-08-25T11:00:00.000Z', 24, 6, 60),
        // The exact current boundary belongs to current, while the earlier
        // event remains in the adjacent previous seven-day period.
        tokenCount('2026-08-25T12:00:00.000Z', 32, 8, 100, {
          used_percent: 12,
          resets_at: Date.parse('2026-09-01T14:00:00.000Z') / 1000,
          window_minutes: 300,
        }),
        tokenCount('2026-08-30T10:00:00.000Z', 40, 10, 150),
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
      ['/home/test/.codex/sessions/2026/08/31', [{ entry: 'rollout-short-only.jsonl', type: 'FILE' }]],
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

    const usage = await captureCodexLocal(api, '/home/test', now);

    expect(usage.current.tokens).toBe(90);
    expect(usage.previous?.tokens).toBe(50);
    expect(usage.current_period_start).toBeUndefined();
    expect(usage.current_period_end).toBeUndefined();
    expect(usage.current_period_key).toBe(`rolling7d:${currentStart}:${Math.floor(now.getTime() / 1000)}`);
    expect(usage.previous_period_end).toBeUndefined();

    const noQuotaRollout = files.get(rolloutPath)!.split('\n').map((line) => {
      const entry = JSON.parse(line) as { payload?: Record<string, unknown> };
      if (!entry.payload || !('rate_limits' in entry.payload)) return line;
      delete entry.payload.rate_limits;
      return JSON.stringify(entry);
    }).join('\n');
    files.set(rolloutPath, noQuotaRollout);
    const noQuotaUsage = await captureCodexLocal(api, '/home/test', now);
    expect(noQuotaUsage.current.tokens).toBe(90);
    expect(noQuotaUsage.previous?.tokens).toBe(50);
    expect(noQuotaUsage.current_period_key).toBe(usage.current_period_key);

    const later = new Date('2026-09-01T12:00:01.000Z');
    const laterUsage = await captureCodexLocal(api, '/home/test', later);
    const [merged] = mergeStableLocalProviders(
      [laterUsage], [noQuotaUsage], later.toISOString(), now.toISOString(),
    );
    expect(merged.current.tokens).toBe(50);
    expect(merged.previous?.tokens).toBe(70);
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
