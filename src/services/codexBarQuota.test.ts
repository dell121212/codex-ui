import { describe, expect, it } from 'vitest';
import { parseCodexBarQuota } from './codexBarQuota';

describe('CodexBar quota CLI adapter', () => {
  it('maps CodexBar JSON usage windows and ignores other providers', () => {
    const parsed = parseCodexBarQuota(JSON.stringify([
      { provider: 'claude', usage: { primary: { usedPercent: 99 } } },
      {
        provider: 'codex',
        source: 'oauth',
        usage: {
          primary: {
            usedPercent: 42.5,
            windowMinutes: 300,
            resetsAt: '2026-09-23T10:00:00Z',
          },
          secondary: {
            usedPercent: 71,
            windowMinutes: 10_080,
            resetsAt: '2026-09-28T12:00:00Z',
          },
        },
      },
    ]), Math.floor(Date.parse('2026-09-23T09:00:00Z') / 1000));

    expect(parsed?.window_5h).toMatchObject({
      used: 43,
      limit: 100,
      percent: 42.5,
      window_duration_mins: 300,
      reset_at_unix: Date.parse('2026-09-23T10:00:00Z') / 1000,
      remaining_secs: 3600,
    });
    expect(parsed?.window_weekly).toMatchObject({ used: 71, percent: 71, window_duration_mins: 10_080 });
    expect(parsed?.rate_limits[0]).toMatchObject({ id: 'codex', plan_type: null });
  });

  it('maps a lone weekly window and treats missing or synthetic windows as absent', () => {
    const parsed = parseCodexBarQuota({
      provider: 'codex',
      usage: {
        primary: { usedPercent: 0, windowMinutes: 300, isSyntheticPlaceholder: true },
        secondary: { usedPercent: 18, windowMinutes: 10_080, resetsAt: null },
      },
    }, 1_000);

    expect(parsed?.window_5h).toMatchObject({ limit: 0, percent: 0, window_duration_mins: 0 });
    expect(parsed?.window_weekly).toMatchObject({ used: 18, percent: 18, reset_at_unix: 0 });
  });

  it('preserves CodexBar over-quota percentages for the existing display layer to clamp', () => {
    const parsed = parseCodexBarQuota({
      provider: 'codex',
      usage: { primary: { usedPercent: 112.5, windowMinutes: 300 } },
    });
    expect(parsed?.window_5h).toMatchObject({ used: 113, limit: 100, percent: 112.5 });
  });

  it('returns null for absent, malformed, non-Codex, and invalid quota data', () => {
    expect(parseCodexBarQuota(null)).toBeNull();
    expect(parseCodexBarQuota('{not json')).toBeNull();
    expect(parseCodexBarQuota({ provider: 'claude', usage: { primary: { usedPercent: 10 } } })).toBeNull();
    expect(parseCodexBarQuota({ provider: 'codex', usage: { primary: { usedPercent: '10' } } })).toBeNull();
    expect(parseCodexBarQuota({ provider: 'codex', usage: { primary: null, secondary: {} } })).toBeNull();
  });
});
