import { CalendarClock, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { PeriodUsage, WindowUsage } from '../types';
import { formatTokenExact, formatTokenM, formatTokenWithUnit } from '../services/tokenDisplay';
import { isWindowMissing, usageHeatColor } from '../services/usageLogic';

export type DashboardDensity = 'detail' | 'balanced' | 'compact';

interface Props {
  providerName: string;
  source?: string;
  primary?: WindowUsage;
  secondary?: WindowUsage;
  primaryLabel: string;
  secondaryLabel?: string;
  periodCopy: string;
  accentColor: string;
  density: DashboardDensity;
  emptyCopy?: string;
  footer?: ReactNode;
  /** Local activity stays distinct from the official quota ring. */
  localPrimary?: PeriodUsage;
  localPrevious?: PeriodUsage;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatOfficialQuota(value: number): string {
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
  if (!timestamp) return '无重置';
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function pressureState(percent: number, hasLimit: boolean, available: boolean): { className: string; label: string; description: string } {
  if (!available) return { className: 'neutral', label: '等待', description: '等待官方额度' };
  if (!hasLimit) return { className: 'neutral', label: '本地', description: '本地用量' };
  if (percent >= 90) return { className: 'critical', label: '接近', description: '接近额度上限' };
  if (percent >= 75) return { className: 'warning', label: '偏高', description: '官方额度用量偏高' };
  return { className: 'healthy', label: '充足', description: '官方额度余量充足' };
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
  localPrimary,
  localPrevious,
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
  const localValue = localPrimary ? formatTokenM(localPrimary.tokens) : null;
  const localTitle = localPrimary ? formatTokenExact(localPrimary.tokens) : undefined;
  const previousTitle = localPrevious ? formatTokenExact(localPrevious.tokens) : undefined;
  const metricTokenValue = !hasLimit ? formatTokenM(metric.used) : undefined;
  const metricTokenTitle = !hasLimit ? formatTokenExact(metric.used) : undefined;
  const durationSecs = Math.max(0, metric.window_duration_mins * 60);
  const elapsedSecs = durationSecs > 0 ? Math.max(0, durationSecs - Math.max(0, metric.remaining_secs)) : 0;
  const timePercent = durationSecs > 0 ? Math.min(100, Math.round((elapsedSecs / durationSecs) * 100)) : 0;

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
            {available
              ? source && <span className="usage-hero-brand-subtitle" title={source}>{source}</span>
              : <span className="usage-hero-brand-subtitle">{emptyCopy}</span>}
          </span>
        </div>
        <span className={`usage-state usage-state--${pressure.className}`} title={pressure.description} aria-label={pressure.description}>
          <i aria-hidden />
          {pressure.label}
        </span>
      </div>

      <div className="usage-hero-main">
        <div className="usage-ring" aria-label={`${primaryLabel}：${hasLimit ? `${Math.round(remaining)}% 剩余` : '暂不可用'}`}>
          <svg viewBox="0 0 124 124" role="img" aria-label={`${primaryLabel}环`}>
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
            <strong
              title={metricTokenTitle === '—' ? undefined : metricTokenTitle}
              aria-label={metricTokenTitle}
            >
              {hasLimit ? `${Math.round(remaining)}%` : metricTokenValue}
            </strong>
            <span>{hasLimit ? '剩余' : available ? primaryLabel : '待同步'}</span>
          </div>
        </div>

        <div className="usage-hero-detail">
          <div className="usage-hero-kicker" title={localPrimary ? '当前周期本地 Token' : primaryLabel}>
            {localPrimary ? '本地' : primaryLabel}
          </div>
          <div className="usage-hero-title" aria-label={localPrimary ? `当前周期本地 Token ${localTitle}` : undefined}>
            {localPrimary ? (
              <>
                <strong className="usage-hero-local-value" title={localTitle} aria-label={localTitle}>
                  {localValue}
                </strong>
                {localPrevious && (
                  <span className="usage-hero-previous" title={previousTitle} aria-label={`上一周期 ${previousTitle}`}>
                    上期 {formatTokenWithUnit(localPrevious.tokens)}
                  </span>
                )}
              </>
            ) : (
              <>
                {periodCopy}
                <strong
                  title={metricTokenTitle === '—' ? undefined : metricTokenTitle}
                  aria-label={metricTokenTitle}
                >
                  {hasLimit ? `${Math.round(used)}%` : metricTokenValue}
                </strong>
              </>
            )}
          </div>
          <div
            className="usage-hero-progress"
            role="progressbar"
            aria-label="周期时间进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={durationSecs > 0 ? timePercent : undefined}
            aria-valuetext={durationSecs > 0 ? `已过 ${timePercent}%` : '周期时间不可用'}
          >
            <span
              style={{
                width: `${durationSecs > 0 ? timePercent : 0}%`,
              }}
            />
          </div>
          <div className="usage-hero-reset">
            <CalendarClock size={14} aria-hidden />
            {metric.remaining_secs > 0
              ? <span><strong>{formatCountdown(metric.remaining_secs)}</strong>后重置</span>
              : <span>重置 <strong>未提供</strong></span>}
          </div>
          <div className="usage-hero-reset-date">{formatReset(metric.reset_at_unix)}</div>
        </div>
      </div>

      <div className="usage-stat-grid">
        <div className="usage-stat">
          <span title={localPrimary ? '本地 Token' : undefined}>{localPrimary ? '本地' : '已用'}</span>
          <strong
            title={localTitle ?? (metricTokenTitle === '—' ? undefined : metricTokenTitle)}
            aria-label={localTitle ?? metricTokenTitle}
          >
            {localValue ?? (hasLimit ? `${Math.round(used)}%` : metricTokenValue)}
          </strong>
        </div>
        <div className="usage-stat">
          <span>{primaryLabel}</span>
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
                : <span
                    title={formatTokenExact(secondary.used)}
                    aria-label={formatTokenExact(secondary.used)}
                  >
                    {formatTokenWithUnit(secondary.used)} 已用
                  </span>}
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
            <span>上限 {secondary.limit > 0 ? formatOfficialQuota(secondary.limit) : '未提供'}</span>
            <span>{secondary.remaining_secs > 0 ? `${formatCountdown(secondary.remaining_secs)}后重置` : '无重置'}</span>
            {secondary.reset_at_unix > 0 && <span>{formatReset(secondary.reset_at_unix)}</span>}
          </div>
        </div>
      )}

      {footer && <div className="usage-hero-footer">{footer}</div>}
    </section>
  );
}
