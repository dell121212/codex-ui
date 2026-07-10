import type { RateLimitBucket, WindowUsage } from '../types';

interface Props {
  buckets?: RateLimitBucket[];
}

function bucketName(bucket: RateLimitBucket): string {
  if (bucket.name) return bucket.name;
  return bucket.id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function windowName(window: WindowUsage, fallback: string): string {
  const mins = window.window_duration_mins;
  if (mins === 300) return '5 小时';
  if (mins === 10_080) return '7 天';
  if (mins >= 1_440 && mins % 1_440 === 0) return `${mins / 1_440} 天`;
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} 小时`;
  return mins > 0 ? `${mins} 分钟` : fallback;
}

function resetText(window: WindowUsage): string {
  if (!window.reset_at_unix) return '';
  return new Date(window.reset_at_unix * 1000).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function color(percent: number): string {
  if (percent >= 90) return 'var(--red)';
  if (percent >= 75) return 'var(--orange)';
  return 'var(--green)';
}

function QuotaWindow({ window, fallback }: { window: WindowUsage; fallback: string }) {
  if (!window.limit) return null;
  return (
    <div className="quota-window">
      <div className="quota-window-header">
        <span>{windowName(window, fallback)}</span>
        <span>{Math.round(window.percent)}%</span>
      </div>
      <div className="progress-bg">
        <div
          className="progress-fill"
          style={{ width: `${window.percent}%`, background: color(window.percent) }}
        />
      </div>
      {window.reset_at_unix > 0 && <div className="quota-reset">重置于 {resetText(window)}</div>}
    </div>
  );
}

export default function QuotaList({ buckets }: Props) {
  const extraBuckets = buckets?.filter((bucket) => bucket.id.toLowerCase() !== 'codex') ?? [];
  if (!extraBuckets.length) return null;

  return (
    <section className="quota-section" aria-label="独立模型额度">
      <div className="section-title">独立模型额度</div>
      {extraBuckets.map((bucket) => (
        <div className="card quota-card" key={bucket.id}>
          <div className="quota-title-row">
            <span className="quota-title">{bucketName(bucket)}</span>
            <span className="quota-id">{bucket.id}</span>
          </div>
          <QuotaWindow window={bucket.primary} fallback="短窗口" />
          <QuotaWindow window={bucket.secondary} fallback="长窗口" />
        </div>
      ))}
    </section>
  );
}
