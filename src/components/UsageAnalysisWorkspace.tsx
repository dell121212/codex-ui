import { useMemo, useState, type CSSProperties } from 'react';
import type { ProviderLocalUsage, UsagePeriodKey, UsageSnapshot } from '../types';
import { buildUsagePortfolio, summarizePeriodCost } from '../services/usageAggregation';
import ModelList from './ModelList';
import QuotaList from './QuotaList';
import UsagePeriodCards from './UsagePeriodCards';

interface Props {
  data: UsageSnapshot | null;
  providers: ProviderLocalUsage[];
}

export default function UsageAnalysisWorkspace({ data, providers }: Props) {
  const [period, setPeriod] = useState<UsagePeriodKey>('current');
  const portfolio = useMemo(
    () => buildUsagePortfolio(data, providers),
    [data, providers],
  );
  const selectedUsage = portfolio[period];
  const selectedProviders = [...portfolio.providers].sort((a, b) => b[period].tokens - a[period].tokens);
  const totalTokens = selectedUsage.tokens;
  const selectedLabel = period === 'current' ? '当前周期' : period === 'month' ? '当月' : '总计';
  const codexModels = data?.total_local?.models ?? data?.month_local.models ?? [];

  return (
    <div className="usage-workspace usage-portfolio">
      <UsagePeriodCards
        value={period}
        onChange={setPeriod}
        options={[
          {
            id: 'current',
            label: '当前周期',
            value: fmtCompact(portfolio.current.tokens),
            detail: `${portfolio.current.messages} 次消息`,
            usage: portfolio.current,
          },
          {
            id: 'month',
            label: '当月 Token',
            value: fmtCompact(portfolio.month.tokens),
            detail: `${portfolio.month.models.length} 个模型`,
            usage: portfolio.month,
          },
          {
            id: 'total',
            label: '总 Token',
            value: fmtCompact(portfolio.total.tokens),
            detail: '本地已记录',
            usage: portfolio.total,
          },
        ]}
      />

      <section className="card provider-analysis-card" aria-label="Provider 用量贡献">
        <div className="provider-analysis-heading">
          <div>
            <strong>Provider 贡献</strong>
            <span>按{selectedLabel} Token 排序</span>
          </div>
          <span>{selectedLabel} · {fmtCompact(totalTokens)} Token</span>
        </div>

        <div className="provider-analysis-list">
          {selectedProviders.map((provider) => {
            const usage = provider[period];
            const estimate = summarizePeriodCost(usage);
            const share = period === 'current'
              ? provider.currentShare
              : period === 'month'
                ? provider.monthShare
                : provider.totalShare;
            return (
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
                  <small>{usage.tokens > 0 ? `${usage.messages} 次消息` : '暂无本地用量'}</small>
                </span>
              </div>
              <AnalysisMetric label={selectedLabel} value={fmtCompact(usage.tokens)} />
              <AnalysisMetric label="估价" value={`~$${estimate.usd.toFixed(2)}`} />
              <div className="provider-analysis-share">
                <div>
                  <span>贡献</span>
                  <strong>{share.toFixed(share >= 10 ? 0 : 1)}%</strong>
                </div>
                <div className="provider-analysis-track">
                  <span
                    style={{
                      width: `${Math.max(share > 0 ? 2 : 0, share)}%`,
                      background: provider.color,
                    }}
                  />
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      <div className="usage-detail-grid usage-detail-grid--portfolio usage-detail-grid--single">
        <ModelList
          models={selectedUsage.models}
          monthModels={selectedUsage.models}
          title={`${selectedLabel}跨公司模型用量`}
        />
      </div>

      <QuotaList buckets={data?.rate_limits} usedModels={codexModels} title="OpenAI 独立模型额度" />
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
