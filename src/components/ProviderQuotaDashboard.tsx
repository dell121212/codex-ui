import { CalendarClock, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { WindowUsage } from '../types';
import { isWindowMissing, usageHeatColor } from '../services/usageLogic';

export type DashboardDensity = 'detail' | 'balanced' | 'compact';

interface Props {
  providerName: string;
  source: string;
  primary?: WindowUsage;
  secondary?: WindowUsage;
  primaryLabel: string;
  secondaryLabel?: string;
  periodCopy: string;
  accentColor: string;
  density: DashboardDensity;
  emptyCopy?: string;
  footer?: ReactNode;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '未提供';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  return `${Math.max(1, minutes)}分钟`;
}

function formatReset(timestamp: number): string {
  if (!timestamp) return '无官方重置时间';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pressureState(percent: number, hasLimit: boolean, available: boolean): { className: string; label: string } {
  if (!available) return { className: 'neutral', label: '等待数据' };
  if (!hasLimit) return { className: 'neutral', label: '本地用量' };
  if (percent >= 90) return { className: 'critical', label: '接近上限' };
  if (percent >= 75) return { className: 'warning', label: '用量偏高' };
  return { className: 'healthy', label: '余量充足' };
}

export default function ProviderQuotaDashboard({
  providerName,
  source,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel = '次级额度',
  periodCopy,
  accentColor,
  density,
  emptyCopy = '等待该 Provider 返回额度或本地用量。',
  footer,
}: Props) {
  const available = !isWindowMissing(primary);
  const metric: WindowUsage = primary ?? {
    used: 0,
    limit: 0,
    percent: 0,
    window_duration_mins: 0,
    reset_at_unix: 0,
    remaining_secs: 0,
  };
  const hasLimit = available && metric.limit > 0;
  const used = Math.min(100, Math.max(0, metric.percent));
  const remaining = Math.max(0, 100 - used);
  const ringOffset = CIRCUMFERENCE * (1 - (hasLimit ? used : 0) / 100);
  const pressure = pressureState(used, hasLimit, available);
  const secondaryAvailable = !isWindowMissing(secondary);

  return (
    <section
      className={`card usage-hero usage-hero--${pressure.className} usage-hero--${density}`}
      style={{ '--provider-accent': accentColor } as CSSProperties}
    >
      <div className="usage-hero-glow usage-hero-glow--one" aria-hidden />
      <div className="usage-hero-glow usage-hero-glow--two" aria-hidden />

      <div className="usage-hero-header">
        <div className="usage-hero-brand">
          <span className="usage-hero-brand-icon" aria-hidden><Sparkles size={14} /></span>
          <span>
            <span className="usage-hero-brand-title">{providerName}</span>
            <span className="usage-hero-brand-subtitle">{available ? source : emptyCopy}</span>
          </span>
        </div>
        <span className={`usage-state usage-state--${pressure.className}`}>
          <i aria-hidden />
          {pressure.label}
        </span>
      </div>

      <div className="usage-hero-main">
        <div className="usage-ring" aria-label={`${primaryLabel}用量`}>
          <svg viewBox="0 0 124 124" role="img">
            <circle className="usage-ring-track" cx="62" cy="62" r={RADIUS} />
            <circle
              className="usage-ring-value"
              cx="62"
              cy="62"
              r={RADIUS}
              stroke={hasLimit ? usageHeatColor(used) : accentColor}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
            />
          </svg>
          <div className="usage-ring-copy">
            <strong>{hasLimit ? `${Math.round(remaining)}%` : fmtCompact(metric.used)}</strong>
            <span>{hasLimit ? '剩余' : available ? '已用' : '待同步'}</span>
          </div>
        </div>

        <div className="usage-hero-detail">
          <div className="usage-hero-kicker">{primaryLabel}</div>
          <div className="usage-hero-title">
            {periodCopy}
            <strong>{hasLimit ? `${Math.round(used)}%` : fmtCompact(metric.used)}</strong>
          </div>
          <div className="usage-hero-progress" aria-hidden>
            <span
              style={{
                width: `${hasLimit ? used : 100}%`,
                background: hasLimit ? usageHeatColor(used) : accentColor,
              }}
            />
          </div>
          <div className="usage-hero-reset">
            <CalendarClock size={14} aria-hidden />
            {metric.remaining_secs > 0
              ? <span><strong>{formatCountdown(metric.remaining_secs)}</strong>后重置</span>
              : <span>重置时间 <strong>未提供</strong></span>}
          </div>
          <div className="usage-hero-reset-date">{formatReset(metric.reset_at_unix)}</div>
        </div>
      </div>

      <div className="usage-stat-grid">
        <div className="usage-stat">
          <span>已用</span>
          <strong>{hasLimit ? `${Math.round(used)}%` : fmtCompact(metric.used)}</strong>
        </div>
        <div className="usage-stat">
          <span>额度</span>
          <strong>{hasLimit ? `${Math.round(remaining)}% 剩余` : '未提供上限'}</strong>
        </div>
        <div className="usage-stat">
          <span>重置</span>
          <strong>{formatCountdown(metric.remaining_secs)}</strong>
        </div>
      </div>

      {secondaryAvailable && secondary && (
        <div className="usage-secondary">
          <div className="usage-secondary-head">
            <span>{secondaryLabel}</span>
            <strong>
              {secondary.limit > 0
                ? `${Math.round(100 - secondary.percent)}% 剩余`
                : `${fmtCompact(secondary.used)} 已用`}
            </strong>
          </div>
          <div className="usage-secondary-track">
            <span
              style={{
                width: `${secondary.limit > 0 ? secondary.percent : 100}%`,
                background: secondary.limit > 0 ? usageHeatColor(secondary.percent) : accentColor,
              }}
            />
          </div>
          <div className="usage-secondary-meta">
            <span>额度 {secondary.limit > 0 ? fmtCompact(secondary.limit) : '未提供'}</span>
            <span>{secondary.remaining_secs > 0 ? `${formatCountdown(secondary.remaining_secs)}后重置` : '重置时间未提供'}</span>
          </div>
        </div>
      )}

      {footer && <div className="usage-hero-footer">{footer}</div>}
    </section>
  );
}
