import { useMemo, type CSSProperties } from 'react';
import type { ProviderLocalUsage, UsageSnapshot } from '../types';
import { buildUsagePortfolio } from '../services/usageAggregation';
import ModelList from './ModelList';
import QuotaList from './QuotaList';
import SpendCard from './SpendCard';

interface Props {
  data: UsageSnapshot | null;
  providers: ProviderLocalUsage[];
}

export default function UsageAnalysisWorkspace({ data, providers }: Props) {
  const portfolio = useMemo(
    () => buildUsagePortfolio(data, providers),
    [data, providers],
  );
  const codexModels = [
    ...(data?.today_local.models ?? []),
    ...(data?.month_local.models ?? []),
  ];

  return (
    <div className="usage-workspace usage-portfolio">
      <section className="workspace-summary-strip workspace-summary-strip--portfolio">
        <MetricTile label="今日总 Token" value={fmtCompact(portfolio.today.tokens)} detail={`${portfolio.today.messages} 次消息`} />
        <MetricTile label="本月总 Token" value={fmtCompact(portfolio.month.tokens)} detail={`${portfolio.month.models.length} 个模型`} />
        <MetricTile label="活跃 Provider" value={String(portfolio.activeProviders)} detail={`共监测 ${portfolio.providers.length} 家`} />
        <MetricTile label="综合 API 估价" value={`$${portfolio.spend.month_total_usd.toFixed(2)}`} detail="本月等价成本" />
      </section>

      <section className="card provider-analysis-card" aria-label="Provider 用量贡献">
        <div className="provider-analysis-heading">
          <div>
            <strong>Provider 贡献</strong>
            <span>按本月 Token 排序</span>
          </div>
          <span>{fmtCompact(portfolio.month.tokens)} Token</span>
        </div>

        <div className="provider-analysis-list">
          {portfolio.providers.map((provider) => (
            <div className="provider-analysis-row" key={provider.id}>
              <div className="provider-analysis-identity">
                <span
                  className="provider-analysis-badge"
                  style={{ '--provider-color': provider.color } as CSSProperties}
                >
                  {provider.badge}
                </span>
                <span>
                  <strong>{provider.fullName}</strong>
                  <small>{provider.month.tokens > 0 ? `${provider.month.messages} 次消息` : '暂无本地用量'}</small>
                </span>
              </div>
              <AnalysisMetric label="今日" value={fmtCompact(provider.today.tokens)} />
              <AnalysisMetric label="本月" value={fmtCompact(provider.month.tokens)} />
              <AnalysisMetric label="估价" value={`$${provider.spend.month_total_usd.toFixed(2)}`} />
              <div className="provider-analysis-share">
                <div>
                  <span>贡献</span>
                  <strong>{provider.monthShare.toFixed(provider.monthShare >= 10 ? 0 : 1)}%</strong>
                </div>
                <div className="provider-analysis-track">
                  <span
                    style={{
                      width: `${Math.max(provider.monthShare > 0 ? 2 : 0, provider.monthShare)}%`,
                      background: provider.color,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="usage-detail-grid usage-detail-grid--portfolio">
        <ModelList
          models={portfolio.today.models}
          monthModels={portfolio.month.models}
          title="本月跨公司模型用量"
          preferMonth
        />
        <SpendCard spend={portfolio.spend} today={portfolio.today} month={portfolio.month} />
      </div>

      <QuotaList buckets={data?.rate_limits} usedModels={codexModels} title="OpenAI 独立模型额度" />
    </div>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="workspace-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AnalysisMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="provider-analysis-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
