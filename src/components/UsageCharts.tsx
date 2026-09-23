import { useMemo, useState } from 'react';
import type { ModelUsage, UsageEvent } from '../types';
import { formatTokenExact, formatTokenM } from '../services/tokenDisplay';
import { buildUsageChartData, type UsageChartSegment } from '../services/usageChartData';
import { analyzeUsageEvents } from '../services/usageEventAnalysis';

interface Props {
  models: ModelUsage[];
  events: UsageEvent[];
  periodLabel: string;
  dailyUsage?: Array<{ day: string; tokens: number }>;
}

export default function UsageCharts({ models, events, periodLabel, dailyUsage }: Props) {
  const data = useMemo(() => buildUsageChartData(models), [models]);
  const trendDays = useMemo(() => dailyUsage ?? (() => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6);
    return analyzeUsageEvents(events, { from, to }).days;
  })(), [dailyUsage, events]);
  const maxDay = Math.max(1, ...trendDays.map((day) => day.tokens));
  const hasTrend = dailyUsage ? dailyUsage.some((day) => day.tokens > 0) : events.length > 0;
  return (
    <section className="usage-charts" aria-label={`${periodLabel}图表分析`}>
      <article className="card usage-chart-card usage-trend-card">
        <div className="usage-chart-heading">
          <div><span className="usage-chart-kicker">ACTIVITY</span><h3>用量趋势</h3></div>
          <span className="usage-chart-range">近七天</span>
        </div>
        {hasTrend ? (
          <div className="event-day-chart" role="img" aria-label="最近七天 Codex Token 用量趋势">
            {trendDays.map((day) => (
              <div className="event-day-column" key={day.day} title={`${day.day} · ${formatTokenExact(day.tokens)} Token`}>
                <span className="event-day-bar" style={{ height: `${day.tokens ? Math.max(3, day.tokens / maxDay * 100) : 0}%` }} />
                <small>{day.day.slice(5)}</small>
              </div>
            ))}
          </div>
        ) : dailyUsage ? <div className="usage-trend-empty" role="status"><strong>最近七天没有事件</strong></div> : (
          <div className="usage-trend-empty" role="status">
            <span className="usage-trend-empty-icon" aria-hidden>↗</span>
            <strong>等待时间戳事件</strong>
            <span>当前数据源没有时间戳记录，趋势暂不可用。</span>
          </div>
        )}
      </article>
      <ModelBars models={data.models} periodLabel={periodLabel} />
      <TokenDonut segments={data.composition} />
    </section>
  );
}

function ModelBars({ models, periodLabel }: { models: ReturnType<typeof buildUsageChartData>['models']; periodLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...models.map(({ tokens }) => tokens));
  return (
    <article className="card usage-chart-card">
      <div className="usage-chart-heading">
        <div><span className="usage-chart-kicker">MODEL LOAD</span><h3>模型用量</h3></div>
        <span className="usage-chart-range">{periodLabel} · Top {models.length}</span>
      </div>
      {models.length ? (
        <div className="usage-model-bars" onMouseLeave={() => setActive(null)}>
          {models.map((item, index) => (
            <button
              className={`usage-model-bar-row${active === index ? ' is-active' : ''}`}
              key={item.label}
              type="button"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              title={`${item.label}: ${formatTokenExact(item.tokens)} tokens`}
            >
              <span className="usage-model-bar-label">{item.label}</span>
              <span className="usage-model-bar-track"><span style={{ width: `${Math.max(2, item.tokens / max * 100)}%`, background: item.color }} /></span>
              <strong>{formatTokenM(item.tokens)}</strong>
            </button>
          ))}
        </div>
      ) : <div className="usage-chart-empty">当前周期没有可展示的模型用量</div>}
    </article>
  );
}

function TokenDonut({ segments }: { segments: UsageChartSegment[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const circles = useMemo(() => {
    let offset = 0;
    return segments.map((segment) => {
      const length = total ? segment.value / total * 100 : 0;
      const circle = { ...segment, length, offset };
      offset += length;
      return circle;
    });
  }, [segments, total]);
  const selected = active === null ? null : segments[active];
  return (
    <article className="card usage-chart-card usage-composition-card">
      <div className="usage-chart-heading">
        <div><span className="usage-chart-kicker">TOKEN MIX</span><h3>Token 构成</h3></div>
      </div>
      <div className="usage-composition-body">
        <div className="usage-donut-wrap" onMouseLeave={() => setActive(null)}>
          <svg className="usage-donut" viewBox="0 0 120 120" role="img" aria-label={total ? '输入、缓存输入和输出 Token 占比' : '暂无 Token 构成数据'}>
            <circle className="usage-donut-track" cx="60" cy="60" r="43" />
            {circles.map((segment, index) => (
              <circle
                key={segment.label}
                className={`usage-donut-segment${active === index ? ' is-active' : ''}`}
                cx="60" cy="60" r="43"
                pathLength="100"
                stroke={segment.color}
                strokeDasharray={`${segment.length} ${100 - segment.length}`}
                strokeDashoffset={-segment.offset}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                tabIndex={0}
                role="button"
                aria-label={`${segment.label}: ${formatTokenExact(segment.value)} tokens`}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setActive(index); }}
              />
            ))}
            <text x="60" y="57" textAnchor="middle" className="usage-donut-value">{formatTokenM(selected?.value ?? total)}</text>
            <text x="60" y="73" textAnchor="middle" className="usage-donut-label">{selected?.label ?? '总 Token'}</text>
          </svg>
        </div>
        <div className="usage-composition-legend">
          {segments.map((segment, index) => (
            <button
              key={segment.label}
              type="button"
              className={`usage-composition-row${active === index ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              title={formatTokenExact(segment.value)}
            >
              <span className="usage-composition-name"><i style={{ background: segment.color }} />{segment.label}</span>
              <strong>{formatTokenM(segment.value)}</strong>
              <small>{total ? `${(segment.value / total * 100).toFixed(1)}%` : '—'}</small>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
