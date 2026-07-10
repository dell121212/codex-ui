import type { PeriodUsage, SpendInfo } from '../types';

interface Props {
  spend?: SpendInfo;
  today?: PeriodUsage;
  month?: PeriodUsage;
}

function fmtNum(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

export default function SpendCard({ spend, today, month }: Props) {
  const unpriced = spend?.unpriced_models.length ?? 0;
  return (
    <div className="card spend-card">
      <div className="card-label">API 等价估算</div>
      <div className="spend-amount">~${(spend?.month_total_usd ?? 0).toFixed(2)}</div>
      <div className="spend-period">本月 · 标准 API 单价</div>
      <div className="stat-list" style={{ marginTop: 6 }}>
        <div className="stat-row">
          <span className="stat-label">今日 token</span>
          <span className="stat-value">{fmtNum(today?.tokens ?? 0)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">月底预估</span>
          <span className="stat-value">~${(spend?.projected_usd ?? 0).toFixed(2)}</span>
        </div>
        {unpriced > 0 && (
          <div className="stat-row">
            <span className="stat-label">未计价模型</span>
            <span className="stat-value" title={spend?.unpriced_models.join(', ')}>{unpriced}</span>
          </div>
        )}
        {!unpriced && month?.tokens === 0 && (
          <div className="stat-row">
            <span className="stat-label">本月 token</span>
            <span className="stat-value">0</span>
          </div>
        )}
      </div>
    </div>
  );
}
