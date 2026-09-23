import type { RateLimitBucket, WindowUsage } from '../types';
import { EMPTY_WINDOW, normalizeCodexWindows } from './usageLogic';

/**
 * Adapter for CodexBar 0.64.2's `codexbar usage --provider codex --format json`
 * ProviderPayload. CodexBar's Linux CLI is portable; this adapter consumes its
 * emitted JSON only and deliberately performs no credential or network work.
 * Source contract: CodexBar `Sources/CodexBarCLI/CLIPayloads.swift` and
 * `Sources/CodexBarCore/UsageFetcher.swift` (RateWindow Codable fields).
 */
export interface CodexBarQuota {
  window_5h: WindowUsage;
  window_weekly: WindowUsage;
  rate_limits: RateLimitBucket[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function timestampUnix(value: unknown): number {
  if (typeof value === 'string') {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? Math.floor(millis / 1000) : 0;
  }
  const numeric = finiteNumber(value);
  return numeric === null || numeric < 0 ? 0 : Math.floor(numeric);
}

function parseWindow(value: unknown, nowUnix: number): WindowUsage | null {
  const data = record(value);
  if (!data || data.isSyntheticPlaceholder === true) return null;

  const percent = finiteNumber(data.usedPercent);
  if (percent === null) return null;

  const rawMinutes = finiteNumber(data.windowMinutes);
  const duration = rawMinutes !== null && rawMinutes > 0 ? Math.floor(rawMinutes) : 0;
  const resetAt = timestampUnix(data.resetsAt);
  return {
    // CodexBar exposes percentage, not token/request totals. Match the app's
    // existing quota representation (used out of 100) without fabricating units.
    used: Math.max(0, Math.round(percent)),
    limit: 100,
    percent: Math.max(0, percent),
    window_duration_mins: duration,
    reset_at_unix: resetAt,
    remaining_secs: Math.max(0, resetAt - nowUnix),
  };
}

/**
 * Parse the JSON array emitted by CodexBar's portable usage CLI, or a single
 * provider payload. Returns null when no valid Codex quota window is present.
 */
export function parseCodexBarQuota(raw: unknown, nowUnix = Math.floor(Date.now() / 1000)): CodexBarQuota | null {
  let decoded = raw;
  if (typeof raw === 'string') {
    try {
      decoded = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const payloads = Array.isArray(decoded) ? decoded : [decoded];
  for (const item of payloads) {
    const payload = record(item);
    if (!payload || payload.provider !== 'codex') continue;
    const usage = record(payload.usage);
    if (!usage) continue;

    const primary = parseWindow(usage.primary, nowUnix);
    const secondary = parseWindow(usage.secondary, nowUnix);
    if (!primary && !secondary) continue;

    const normalized = normalizeCodexWindows(primary, secondary);
    return {
      ...normalized,
      rate_limits: [{
        id: 'codex',
        name: null,
        primary: primary ?? { ...EMPTY_WINDOW },
        secondary: secondary ?? { ...EMPTY_WINDOW },
        plan_type: null,
      }],
    };
  }
  return null;
}
