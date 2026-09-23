import { useEffect, useMemo, useState } from 'react';
import type { ProviderLocalUsage } from '../types';
import { formatTokenExact, formatTokenM } from '../services/tokenDisplay';
import { formatUsdEstimate } from '../services/usageLogic';
import { analyzeUsageEvents, type EventAnalysisRow } from '../services/usageEventAnalysis';
import { queryCodexUsageEvents } from '../services/neutralinoBackend';

const NO_EVENTS: import('../types').UsageEvent[] = [];

interface Props { providers: ProviderLocalUsage[] }

export default function UsageEventAnalysis({ providers }: Props) {
  const codex = providers.find((provider) => provider.provider === 'codex');
  const baseEvents = codex?.events ?? NO_EVENTS;
  const today = dateKey(new Date());
  const [from, setFrom] = useState(() => shiftDate(today, -6));
  const [to, setTo] = useState(today);
  const [project, setProject] = useState('');
  const [model, setModel] = useState('');
  const [session, setSession] = useState('');
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [rangeEvents, setRangeEvents] = useState(baseEvents);
  const [loadingRange, setLoadingRange] = useState(false);
  useEffect(() => setRangeEvents(baseEvents), [baseEvents]);
  useEffect(() => {
    if (!analysisRequested || !from || !to || from > to || !codex) return;
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    end.setHours(23, 59, 59, 999);
    const fromUnix = Math.floor(start.getTime() / 1000);
    const toUnix = Math.floor(Math.min(end.getTime(), Date.now()) / 1000);
    const loadedFrom = codex.events_range_from_unix ?? 0;
    const loadedTo = codex.events_range_to_unix ?? 0;
    if (fromUnix >= loadedFrom && toUnix <= loadedTo) return;

    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingRange(true);
      setRangeEvents(NO_EVENTS);
      void queryCodexUsageEvents(start, end).then((events) => {
        if (active) setRangeEvents(events);
      }).finally(() => {
        if (active) setLoadingRange(false);
      });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [analysisRequested, codex, from, to]);
  const events = useMemo(() => rangeEvents, [rangeEvents]);
  const projects = useMemo(() => unique(events.map((event) => event.project_path ?? 'unknown')), [events]);
  const models = useMemo(() => unique(events.map((event) => event.model)), [events]);
  const sessions = useMemo(() => unique(events.map((event) => event.session_id ?? 'unknown')), [events]);
  const rangeValid = Boolean(from && to && from <= to);
  const analysis = useMemo(() => analyzeUsageEvents(events, {
    from: parseLocalDate(from),
    to: parseLocalDate(to),
    project: project || undefined,
    model: model || undefined,
    session: session || undefined,
  }), [events, from, to, project, model, session]);
  const maxDay = Math.max(1, ...analysis.days.map((day) => day.tokens));

  return (
    <section className="card event-analysis-card" aria-label="自定义时间范围分析">
      <header className="event-analysis-header">
        <div>
          <span className="usage-chart-kicker">EVENT EXPLORER</span>
          <h3>事件与项目分析</h3>
          <p>基于去重后的本地会话事件；筛选范围按本地日历时间计算。</p>
        </div>
        <div className="event-analysis-range">
          <label>从<input aria-label="开始日期" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
          <span aria-hidden>→</span>
          <label>至<input aria-label="结束日期" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      </header>

      <div className="event-analysis-filters" aria-label="事件筛选">
        <FilterSelect label="项目" value={project} onChange={setProject} values={projects} />
        <FilterSelect label="模型" value={model} onChange={setModel} values={models} />
        <FilterSelect label="会话" value={session} onChange={setSession} values={sessions} />
      </div>

      {!analysisRequested ? (
        <div className="event-analysis-empty" role="status">
          <strong>事件明细按需读取</strong>
          <span>启动时只加载汇总数据；选择时间范围后再读取会话事件。</span>
          <button type="button" onClick={() => setAnalysisRequested(true)}>加载所选范围</button>
        </div>
      ) : loadingRange ? (
        <div className="event-analysis-empty" role="status"><strong>正在读取所选时间范围</strong></div>
      ) : !events.length ? (
        <div className="event-analysis-empty" role="status">
          <strong>还没有可分析的时间戳事件</strong>
          <span>完成 Neutralino 构建后，ccusage Rust 引擎会提供 Codex 会话、项目和 Token 事件。</span>
        </div>
      ) : !rangeValid ? (
        <div className="event-analysis-empty" role="alert"><strong>请选择有效的时间范围</strong></div>
      ) : (
        <>
          <div className="event-analysis-metrics">
            <Metric label="筛选用量" value={`${formatTokenM(analysis.tokens)} Token`} exact={formatTokenExact(analysis.tokens)} />
            <Metric
              label="成本估算"
              value={analysis.pricedEvents ? `~${formatUsdEstimate(analysis.costUsd)}` : '暂无价格'}
              exact={analysis.hasUnpriced ? '部分模型未计价' : '全部事件已计价'}
            />
            <Metric label="事件 / 会话" value={`${analysis.events.length} / ${analysis.sessions.length}`} />
            <Metric label="项目" value={String(analysis.projects.length)} />
          </div>

          <div className="event-analysis-grid">
            <article className="event-analysis-subcard event-analysis-timeline">
              <div className="event-analysis-subheading"><strong>每日 Token</strong><span>{analysis.days.length} 天</span></div>
              {analysis.events.length ? (
                <div className="event-day-chart" role="img" aria-label="按日 Token 用量">
                  {analysis.days.map((day) => (
                    <div className="event-day-column" key={day.day} title={`${day.day} · ${formatTokenExact(day.tokens)} Token`}>
                      <span className="event-day-bar" style={{ height: `${day.tokens ? Math.max(3, day.tokens / maxDay * 100) : 0}%` }} />
                      <small>{day.day.slice(5)}</small>
                    </div>
                  ))}
                </div>
              ) : <div className="event-analysis-empty compact">这个时间范围没有事件</div>}
            </article>
            <Ranking title="项目排行" rows={analysis.projects} />
            <Ranking title="模型排行" rows={analysis.models} />
            <Ranking title="会话排行" rows={analysis.sessions} />
            <Ranking title="Agent 子会话归属" rows={analysis.agents} suffix="父会话" />
          </div>
          {analysis.hasUnpriced && <p className="event-analysis-note">费用仅汇总 ccusage 价格快照可识别的模型；未识别价格的事件仍保留 Token 统计。</p>}
        </>
      )}
    </section>
  );
}

function FilterSelect({ label, value, onChange, values }: {
  label: string; value: string; onChange: (value: string) => void; values: string[];
}) {
  return (
    <label className="event-filter-select">{label}
      <select aria-label={`按${label}筛选`} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部{label}</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value, exact }: { label: string; value: string; exact?: string }) {
  return <div className="event-analysis-metric"><span>{label}</span><strong title={exact}>{value}</strong>{exact && <small>{exact}</small>}</div>;
}

function Ranking({ title, rows, suffix = '会话' }: { title: string; rows: EventAnalysisRow[]; suffix?: string }) {
  return (
    <article className="event-analysis-subcard">
      <div className="event-analysis-subheading"><strong>{title}</strong><span>{rows.length}</span></div>
      {rows.length ? (
        <div className="event-ranking-list">
          {rows.slice(0, 5).map((row) => (
            <div className="event-ranking-row" key={row.id} title={row.id}>
              <span className="event-ranking-id">{row.id}</span>
              <span className="event-ranking-details">{row.events} 事件 · {row.sessions} {suffix}{row.hasUnpriced ? (row.pricedEvents ? ' · 部分未计价' : ' · 未计价') : ` · ~${formatUsdEstimate(row.costUsd)}`}</span>
              <strong>{formatTokenM(row.tokens)}</strong>
            </div>
          ))}
        </div>
      ) : <div className="event-analysis-empty compact">暂无数据</div>}
    </article>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date(NaN);
}
