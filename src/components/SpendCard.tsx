import type { PeriodUsage, SpendInfo } from '../types';

interface Props {
  spend?: SpendInfo;
  today?: PeriodUsage;
  month?: PeriodUsage;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export default function SpendCard({ spend, today, month }: Props) {
  return (
    <div className="card spend-card">
      <div className="card-label">API 估算</div>

      <div className="spend-amount">
        {spend?.month_total_usd != null
          ? `$${spend.month_total_usd.toFixed(2)}`
          : '—'}
      </div>
      <div className="spend-period">本月等价成本</div>

      <div className="stat-list" style={{ marginTop: 6 }}>
        {today?.tokens != null && (
          <div className="stat-row">
            <span className="stat-label">今日</span>
            <span className="stat-value">{fmtTok(today.tokens)}</span>
          </div>
        )}
        {month?.tokens != null && (
          <div className="stat-row">
            <span className="stat-label">本月 token</span>
            <span className="stat-value">{fmtTok(month.tokens)}</span>
          </div>
        )}
        {spend?.projected_usd != null && (
          <div className="stat-row">
            <span className="stat-label">月底预估</span>
            <span className="stat-value">${spend.projected_usd.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
