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
  const todayTotalUsd = today?.models.reduce(
    (total, model) => total + (model.cost_usd ?? 0),
    0,
  ) ?? 0;

  return (
    <div className="card spend-card">
      <div className="card-label">API 等价估算</div>
      <div className="spend-amount">~${(spend?.month_total_usd ?? 0).toFixed(2)}</div>
      <div className="spend-period">当月预估 · 标准 API 单价</div>
      <div className="stat-list" style={{ marginTop: 6 }}>
        <div className="stat-row">
          <span className="stat-label">今日 token</span>
          <span className="stat-value">{fmtNum(today?.tokens ?? 0)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">今日金额</span>
          <span className="stat-value">~${todayTotalUsd.toFixed(2)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">当月 token</span>
          <span className="stat-value">{fmtNum(month?.tokens ?? 0)}</span>
        </div>
        {unpriced > 0 && (
          <div className="stat-row">
            <span className="stat-label">未计价模型</span>
            <span className="stat-value" title={spend?.unpriced_models.join(', ')}>{unpriced}</span>
          </div>
        )}
      </div>
    </div>
  );
}
