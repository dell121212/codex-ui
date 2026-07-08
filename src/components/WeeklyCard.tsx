import type { WindowUsage } from '../types';

interface Props {
  window?: WindowUsage;
}

function fmtDuration(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  if (d > 0) return `${d}天 ${h}小时`;
  return `${h}小时`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function barColor(pct: number): string {
  if (pct >= 90) return '#ff453a';
  if (pct >= 75) return '#ff9f0a';
  return '#5e5ce6';
}

export default function WeeklyCard({ window: w }: Props) {
  const pct = w?.percent ?? 0;
  const remaining = w?.limit != null && w?.used != null ? w.limit - w.used : null;

  return (
    <div className="card weekly-card">
      <div className="weekly-header">
        <span className="card-label" style={{ marginBottom: 0 }}>7 天窗口</span>
        <span className="weekly-pct">{Math.round(pct)}%</span>
      </div>

      <div className="progress-bg" style={{ marginTop: 6, marginBottom: 8 }}>
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: barColor(pct),
            transition: 'width 600ms ease, background 400ms ease',
          }}
        />
      </div>

      <div className="stat-list">
        <StatRow label="已用"      value={w?.used    != null ? fmtNum(w.used)    : '—'} />
        <StatRow label="剩余" value={remaining  != null ? fmtNum(remaining) : '—'} />
        {w?.remaining_secs ? (
          <StatRow label="窗口重置" value={fmtDuration(w.remaining_secs)} />
        ) : null}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
