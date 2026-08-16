import { describe, expect, it } from 'vitest';
import { captureCodexLocal } from './codexLocalUsage';
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
    expect(usage.month.tokens).toBe(150);
    expect(usage.total.tokens).toBe(150);
    expect(usage.current_period_end).toBe(Date.parse('2026-08-16T14:00:00.000Z') / 1000);
  });
});

function tokenCount(
  timestamp: string,
  input: number,
  output: number,
  total: number,
  primary?: Record<string, number>,
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
      rate_limits: primary ? { primary } : undefined,
    },
  });
}
