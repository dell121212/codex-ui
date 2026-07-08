import type { WindowUsage } from '../types';

interface Props {
  window?: WindowUsage;
}

const R         = 36;
const CIRC      = 2 * Math.PI * R;       // ≈ 226.2
const CX        = 46;
const CY        = 46;
const SVG_SIZE  = 92;

function ringColor(pct: number): string {
  if (pct >= 90) return '#ff453a';   // red
  if (pct >= 70) return '#ff9f0a';   // orange
  return '#0a84ff';                   // blue
}

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

export default function RingCard({ window: w }: Props) {
  const pct    = w?.percent ?? 0;
  const offset = CIRC * (1 - pct / 100);
  const color  = ringColor(pct);

  return (
    <div className="card ring-card">
      <div className="card-label">5 小时窗口</div>

      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-label={`5 小时窗口已使用 ${Math.round(pct)}%`}
        role="img"
      >
        {/* Track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="var(--sep)"
          strokeWidth="7"
        />
        {/* Progress arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90, ${CX}, ${CY})`}
          style={{ transition: 'stroke-dashoffset 700ms ease, stroke 400ms ease' }}
        />
        {/* Centre text */}
        <text
          x={CX} y={CY - 5}
          textAnchor="middle"
          dominantBaseline="middle"
          className="ring-pct"
        >
          {Math.round(pct)}%
        </text>
        <text
          x={CX} y={CY + 11}
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

      <div className="ring-stats">
        {w?.used != null ? fmtNum(w.used) : '—'}
        {w?.limit ? ` / ${fmtNum(w.limit)}` : ''}
      </div>
    </div>
  );
}
