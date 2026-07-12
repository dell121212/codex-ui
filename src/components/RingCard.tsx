import type { WindowUsage } from '../types';
import { usageHeatColor } from '../services/usageLogic';

interface Props {
  window?: WindowUsage;
  /** Override default "5 小时窗口" label (e.g. Grok 周额度). */
  label?: string;
}

const R         = 40;
const CIRC      = 2 * Math.PI * R;
const CX        = 50;
const CY        = 50;
const SVG_SIZE  = 100;

function fmtDuration(secs: number): string {
  if (secs <= 0) return '现在';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function RingCard({ window: w, label = '5 小时' }: Props) {
  const pct    = w?.percent ?? 0;
  const offset = CIRC * (1 - pct / 100);
  const color  = usageHeatColor(pct);

  return (
    <div className="card ring-card">
      <div className="card-label">{label}</div>

      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-label={`${label}已使用 ${Math.round(pct)}%`}
        role="img"
      >
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="rgba(120,120,128,0.32)"
          strokeWidth="8"
        />
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90, ${CX}, ${CY})`}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1), stroke 400ms ease' }}
        />
        <text
          x={CX} y={CY - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ring-pct"
        >
          {Math.round(pct)}%
        </text>
        <text
          x={CX} y={CY + 14}
          textAnchor="middle"
          className="ring-sub"
        >
          已用
        </text>
      </svg>

      <div className="ring-countdown">
        {w?.remaining_secs
          ? `${fmtDuration(w.remaining_secs)}后重置`
          : '—'}
      </div>

      {(w?.used != null || w?.limit) && (
        <div className="ring-stats">
          {w?.used != null ? fmtNum(w.used) : '—'}
          {w?.limit ? ` / ${fmtNum(w.limit)}` : ''}
        </div>
      )}
    </div>
  );
}
