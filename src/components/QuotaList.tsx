import type { ModelUsage, RateLimitBucket, WindowUsage } from '../types';
import {
  rankRateLimitBuckets,
  usageHeatColor,
  windowDurationLabel,
} from '../services/usageLogic';

interface Props {
  buckets?: RateLimitBucket[];
  /** Models with local token captures — used to pin matching quotas first. */
  usedModels?: ModelUsage[];
  title?: string;
}

function bucketName(bucket: RateLimitBucket): string {
  if (bucket.name) return bucket.name;
  return bucket.id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function QuotaWindow({ window, fallback }: { window: WindowUsage; fallback: string }) {
  if (!window.limit) return null;
  return (
    <div className="quota-window">
      <div className="quota-window-header">
        <span>{windowDurationLabel(window, fallback)}</span>
        <span>{Math.round(100 - window.percent)}% 剩余</span>
      </div>
      <div className="progress-bg">
        <div
          className="progress-fill"
          style={{ width: `${window.percent}%`, background: usageHeatColor(window.percent) }}
        />
      </div>
      {window.reset_at_unix > 0 && <div className="quota-reset">重置于 {resetText(window)}</div>}
    </div>
  );
}

export default function QuotaList({
  buckets,
  usedModels,
  title = '独立模型额度 · 已用优先',
}: Props) {
  const usedIds = (usedModels ?? [])
    .filter((m) => m.input_tokens + m.output_tokens > 0)
    .map((m) => m.model);

  const extraBuckets = rankRateLimitBuckets(
    (buckets ?? []).filter((bucket) => bucket.id.toLowerCase() !== 'codex'),
    usedIds,
  );

  if (!extraBuckets.length) return null;

  const usedSet = new Set(usedIds.map((id) => id.toLowerCase()));
  const isUsed = (bucket: RateLimitBucket) => {
    const id = bucket.id.toLowerCase();
    const name = (bucket.name ?? '').toLowerCase();
    for (const model of usedSet) {
      if (
        model === id
        || model.startsWith(`${id}-`)
        || id.startsWith(`${model}-`)
        || model.includes(id)
        || id.includes(model)
        || (name && (model.includes(name) || name.includes(model)))
      ) {
        return true;
      }
    }
    return false;
  };

  return (
    <section className="quota-section" aria-label="独立模型额度">
      <div className="section-title">{title}</div>
      {extraBuckets.map((bucket) => (
        <div
          className={`card quota-card${isUsed(bucket) ? ' quota-card--used' : ''}`}
          key={bucket.id}
        >
          <div className="quota-title-row">
            <span className="quota-title">{bucketName(bucket)}</span>
            <span className="quota-id">
              {isUsed(bucket) ? '已抓取 · ' : ''}
              {bucket.id}
            </span>
          </div>
          <QuotaWindow window={bucket.primary} fallback="短窗口" />
          <QuotaWindow window={bucket.secondary} fallback="长窗口" />
        </div>
      ))}
    </section>
  );
}
