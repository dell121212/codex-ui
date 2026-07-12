import type { WindowUsage } from '../types';
import { usageHeatColor } from '../services/usageLogic';

interface Props {
  window?: WindowUsage;
  /** Override default "7 天窗口" label. */
  label?: string;
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

export default function WeeklyCard({ window: w, label = '7 天' }: Props) {
  const pct = w?.percent ?? 0;
  const remaining = w?.limit != null && w?.used != null ? w.limit - w.used : null;

  return (
    <div className="card weekly-card">
      <div className="weekly-header">
        <span className="card-label" style={{ marginBottom: 0 }}>{label}</span>
        <span className="weekly-pct">{Math.round(pct)}%</span>
      </div>

      <div className="progress-bg" style={{ marginTop: 8, marginBottom: 10 }}>
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: usageHeatColor(pct),
            transition: 'width 600ms cubic-bezier(.2,.8,.2,1), background 400ms ease',
          }}
        />
      </div>

      <div className="stat-list">
        <StatRow label="已用" value={w?.used != null ? fmtNum(w.used) : '—'} />
        <StatRow label="剩余" value={remaining != null ? fmtNum(remaining) : '—'} />
        {w?.remaining_secs ? (
          <StatRow label="重置" value={fmtDuration(w.remaining_secs)} />
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
