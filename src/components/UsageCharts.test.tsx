import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { UsageEvent } from '../types';
import UsageCharts from './UsageCharts';

function eventAt(timestamp: Date): UsageEvent {
  return {
    timestamp: timestamp.toISOString(),
    timestamp_unix: Math.floor(timestamp.getTime() / 1000),
    timestamp_unix_ms: timestamp.getTime(),
    model: 'gpt-5',
    input_tokens: 100,
    cached_input_tokens: 10,
    output_tokens: 25,
    total_tokens: 125,
    session_id: 'session-a',
    cost_usd: 0.01,
  };
}

describe('UsageCharts event trend', () => {
  it('renders daily bars from real timestamped events', () => {
    const today = new Date();
    const markup = renderToStaticMarkup(
      <UsageCharts models={[]} events={[eventAt(today)]} periodLabel="本期" />,
    );

    expect(markup).toContain('最近七天 Codex Token 用量趋势');
    expect(markup).toContain('event-day-column');
    expect(markup).not.toContain('等待时间戳事件');
  });

  it('shows a clear empty state when no source events exist', () => {
    const markup = renderToStaticMarkup(<UsageCharts models={[]} events={[]} periodLabel="本期" />);
    expect(markup).toContain('等待时间戳事件');
    expect(markup).not.toContain('event-day-column');
  });
});
