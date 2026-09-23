import type { UsageEvent } from '../types';

export interface EventAnalysisOptions {
  from: Date;
  to: Date;
  project?: string;
  model?: string;
  session?: string;
}

export interface EventAnalysisRow {
  id: string;
  tokens: number;
  events: number;
  sessions: number;
  costUsd: number;
  pricedEvents: number;
  hasUnpriced: boolean;
}

export interface EventAnalysis {
  events: UsageEvent[];
  tokens: number;
  costUsd: number;
  pricedEvents: number;
  hasUnpriced: boolean;
  projects: EventAnalysisRow[];
  models: EventAnalysisRow[];
  sessions: EventAnalysisRow[];
  agents: EventAnalysisRow[];
  days: Array<{ day: string; tokens: number }>;
}

export function analyzeUsageEvents(
  source: UsageEvent[],
  options: EventAnalysisOptions,
): EventAnalysis {
  const from = localDayStart(options.from).getTime();
  const until = localNextDayStart(options.to).getTime();
  const events = source.filter((event) => {
    const time = event.timestamp_unix_ms ?? event.timestamp_unix * 1000;
    return time >= from
      && time < until
      && (!options.project || (event.project_path ?? 'unknown') === options.project)
      && (!options.model || event.model === options.model)
      && (!options.session || (event.session_id ?? 'unknown') === options.session);
  });
  const projects = groupEvents(events, (event) => event.project_path ?? 'unknown');
  const models = groupEvents(events, (event) => event.model);
  const sessions = groupEvents(events, (event) => event.session_id ?? 'unknown');
  const agents = groupEvents(
    events.filter((event) => Boolean(event.parent_session_id)),
    (event) => event.parent_session_id ?? 'unknown',
  );
  const daily = new Map<string, number>();
  for (const event of events) {
    const date = new Date(event.timestamp_unix_ms ?? event.timestamp_unix * 1000);
    const day = localDateKey(date);
    daily.set(day, (daily.get(day) ?? 0) + safeTokens(event.total_tokens));
  }
  const days: EventAnalysis['days'] = [];
  for (let cursor = localDayStart(options.from); cursor <= localDayStart(options.to); cursor.setDate(cursor.getDate() + 1)) {
    const day = localDateKey(cursor);
    days.push({ day, tokens: daily.get(day) ?? 0 });
  }
  const cost = sumCosts(events);

  return {
    events,
    tokens: events.reduce((sum, event) => sum + safeTokens(event.total_tokens), 0),
    costUsd: cost.usd,
    pricedEvents: cost.pricedEvents,
    hasUnpriced: cost.hasUnpriced,
    projects,
    models,
    sessions,
    agents,
    days,
  };
}

function groupEvents(events: UsageEvent[], keyFor: (event: UsageEvent) => string): EventAnalysisRow[] {
  const groups = new Map<string, { tokens: number; events: number; sessions: Set<string>; usd: number; pricedEvents: number; unpriced: boolean }>();
  for (const event of events) {
    const key = keyFor(event);
    const row = groups.get(key) ?? { tokens: 0, events: 0, sessions: new Set<string>(), usd: 0, pricedEvents: 0, unpriced: false };
    row.tokens += safeTokens(event.total_tokens);
    row.events += 1;
    if (event.session_id) row.sessions.add(event.session_id);
    if (typeof event.cost_usd === 'number' && Number.isFinite(event.cost_usd)) {
      row.usd += event.cost_usd;
      row.pricedEvents += 1;
    }
    else row.unpriced = true;
    groups.set(key, row);
  }
  return [...groups].map(([id, row]) => ({
    id,
    tokens: row.tokens,
    events: row.events,
    sessions: row.sessions.size,
    costUsd: row.usd,
    pricedEvents: row.pricedEvents,
    hasUnpriced: row.unpriced,
  })).sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));
}

function sumCosts(events: UsageEvent[]): { usd: number; pricedEvents: number; hasUnpriced: boolean } {
  return events.reduce<{ usd: number; pricedEvents: number; hasUnpriced: boolean }>((sum, event) => {
    if (typeof event.cost_usd === 'number' && Number.isFinite(event.cost_usd)) {
      sum.usd += event.cost_usd;
      sum.pricedEvents += 1;
    }
    else sum.hasUnpriced = true;
    return sum;
  }, { usd: 0, pricedEvents: 0, hasUnpriced: false });
}

function safeTokens(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localNextDayStart(date: Date): Date {
  const result = localDayStart(date);
  result.setDate(result.getDate() + 1);
  return result;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
