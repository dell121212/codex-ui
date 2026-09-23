import type { PeriodUsage, UsageEvent } from '../types';
import { addModelUsage, buildPeriodUsage, enrichWithCosts, parseLocalLimitWindow, type ParsedRolloutFile } from './usageLogic';

export interface CcusageBridgeResponse {
  schemaVersion: number;
  engine: string;
  scannedAt: string;
  filesScanned: number;
  cacheHit: boolean;
  summary: {
    today: BridgeSummaryPeriod;
    current: BridgeSummaryPeriod;
    previous: BridgeSummaryPeriod;
    month: BridgeSummaryPeriod;
    total: BridgeSummaryPeriod;
    subtotal: BridgeSummaryPeriod;
    daily: Array<{ day: string; tokens: number }>;
  };
  latestRateLimits?: {
    timestampUnix: number;
    primary?: Record<string, unknown> | null;
    secondary?: Record<string, unknown> | null;
  } | null;
  events: Array<Record<string, unknown>>;
}

interface BridgeSummaryPeriod {
  messages: number;
  tokens: number;
  models: Array<Record<string, unknown>>;
}

export function parseCcusageBridgeResponse(raw: string): {
  events: UsageEvent[];
  cacheHit: boolean;
  filesScanned: number;
  summary: {
    today: PeriodUsage;
    current: PeriodUsage;
    previous: PeriodUsage;
    month: PeriodUsage;
    total: PeriodUsage;
    subtotal: PeriodUsage;
    daily: Array<{ day: string; tokens: number }>;
  };
  latestRateLimits: ParsedRolloutFile['latestRateLimits'];
} {
  const value = JSON.parse(raw) as Partial<CcusageBridgeResponse>;
  if (value.schemaVersion !== 4 || value.engine !== 'ccusage-rust-codex-adapter' || !Array.isArray(value.events) || !value.summary) {
    throw new Error('ccusage bridge returned an unsupported event contract');
  }

  const events = value.events.flatMap((candidate): UsageEvent[] => {
    const timestamp = typeof candidate.timestamp === 'string' ? candidate.timestamp : '';
    const timestampUnixMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampUnixMs)) return [];
    const model = typeof candidate.model === 'string' && candidate.model.trim()
      ? candidate.model.trim()
      : 'unknown';
    const input = count(candidate.inputTokens);
    const cached = Math.min(input, count(candidate.cachedInputTokens));
    const output = count(candidate.outputTokens);
    const total = count(candidate.totalTokens);
    const serviceTier = candidate.serviceTier === 'fast' || candidate.serviceTier === 'standard'
      ? candidate.serviceTier
      : null;

    return [{
      timestamp,
      timestamp_unix: Math.floor(timestampUnixMs / 1000),
      timestamp_unix_ms: timestampUnixMs,
      model,
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      total_tokens: total,
      session_id: nonEmptyString(candidate.sessionId),
      parent_session_id: nonEmptyString(candidate.parentSessionId),
      project_path: nonEmptyString(candidate.projectPath),
      cache_creation_tokens: count(candidate.cacheCreationTokens),
      reasoning_output_tokens: count(candidate.reasoningOutputTokens),
      service_tier: serviceTier,
      cost_usd: typeof candidate.costUsd === 'number' && Number.isFinite(candidate.costUsd)
        ? candidate.costUsd
        : null,
    }];
  });

  return {
    events,
    cacheHit: value.cacheHit === true,
    filesScanned: Number.isFinite(value.filesScanned) ? Number(value.filesScanned) : 0,
    summary: {
      today: parseSummaryPeriod(value.summary.today),
      current: parseSummaryPeriod(value.summary.current),
      previous: parseSummaryPeriod(value.summary.previous),
      month: parseSummaryPeriod(value.summary.month),
      total: parseSummaryPeriod(value.summary.total),
      subtotal: parseSummaryPeriod(value.summary.subtotal),
      daily: value.summary.daily.map((row) => ({ day: row.day, tokens: count(row.tokens) })),
    },
    latestRateLimits: parseLatestRateLimits(value.latestRateLimits),
  };
}

function parseLatestRateLimits(
  raw: CcusageBridgeResponse['latestRateLimits'],
): ParsedRolloutFile['latestRateLimits'] {
  if (!raw || !Number.isFinite(raw.timestampUnix)) return null;
  const primary = parseLocalLimitWindow(raw.primary, raw.timestampUnix);
  const secondary = parseLocalLimitWindow(raw.secondary, raw.timestampUnix);
  if (!primary && !secondary) return null;
  return {
    timestamp_unix: Math.floor(raw.timestampUnix),
    primary: primary ?? { used: 0, limit: 0, percent: 0, window_duration_mins: 0, reset_at_unix: 0, remaining_secs: 0 },
    secondary: secondary ?? { used: 0, limit: 0, percent: 0, window_duration_mins: 0, reset_at_unix: 0, remaining_secs: 0 },
  };
}

function parseSummaryPeriod(raw: BridgeSummaryPeriod | undefined): PeriodUsage {
  if (!raw) return { messages: 0, tokens: 0, models: [] };
  const modelMap = new Map<string, { input: number; cached: number; cacheCreation: number; output: number }>();
  for (const model of raw.models ?? []) {
    const id = nonEmptyString(model.model);
    if (!id) continue;
    addModelUsage(
      modelMap,
      id,
      count(model.inputTokens),
      count(model.cachedInputTokens),
      count(model.outputTokens),
      count(model.cacheCreationTokens),
    );
  }
  return enrichWithCosts(buildPeriodUsage(count(raw.messages), count(raw.tokens), modelMap));
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
