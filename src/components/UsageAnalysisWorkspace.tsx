import { useMemo, useState, type CSSProperties } from 'react';
import type { ProviderLocalUsage, UsagePeriodKey, UsageSnapshot } from '../types';
import { buildUsagePortfolio, summarizePeriodCost } from '../services/usageAggregation';
import { formatTokenExact, formatTokenM } from '../services/tokenDisplay';
import { formatUsdEstimate } from '../services/usageLogic';
import ModelList from './ModelList';
import QuotaList from './QuotaList';
import UsagePeriodCards from './UsagePeriodCards';
import UsageCharts from './UsageCharts';
import UsageEventAnalysis from './UsageEventAnalysis';

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
  const selectedShortLabel = period === 'current' ? '本期' : period === 'month' ? '本月' : '总计';
  const codexModels = data?.total_local?.models ?? data?.month_local.models ?? [];
  const codexEngine = providers.find((provider) => provider.provider === 'codex');

  return (
    <div className="usage-workspace usage-portfolio">
      <UsagePeriodCards
        value={period}
        onChange={setPeriod}
        options={[
          {
            id: 'current',
            label: '本期',
            tokens: portfolio.current.tokens,
            detail: `${portfolio.current.messages} 消息`,
            usage: portfolio.current,
          },
          {
            id: 'month',
            label: '本月',
            tokens: portfolio.month.tokens,
            detail: `${portfolio.month.models.length} 模型`,
            usage: portfolio.month,
          },
          {
            id: 'total',
            label: '总计',
            tokens: portfolio.total.tokens,
            detail: '本地记录',
            usage: portfolio.total,
          },
        ]}
      />

      <section className="card provider-analysis-card" aria-label="Provider 用量贡献">
        <div className="provider-analysis-heading">
          <div>
            <strong>贡献</strong>
            <span title={`按${selectedLabel} Token 排序`}>按{selectedShortLabel}用量</span>
          </div>
          <span
            title={formatTokenExact(totalTokens)}
            aria-label={`${selectedLabel} · ${formatTokenExact(totalTokens)}`}
          >
            {formatTokenM(totalTokens)} Token
          </span>
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
                  <strong title={provider.fullName}>{provider.fullName}</strong>
                  <small>{usage.tokens > 0 ? `${usage.messages} 消息` : '无本地用量'}</small>
                </span>
              </div>
              <AnalysisMetric label={selectedLabel} value={formatTokenM(usage.tokens)} tokenValue={usage.tokens} />
              <AnalysisMetric label="估价" value={`~${formatUsdEstimate(estimate.usd)}`} />
              <div className="provider-analysis-share">
                <div>
                  <span>占比</span>
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

      {codexEngine && (
        <div
          className={`usage-engine-status${codexEngine.usage_engine_error ? ' is-warning' : ''}`}
          role={codexEngine.usage_engine_error ? 'alert' : 'status'}
        >
          <span className="usage-engine-dot" aria-hidden />
          {codexEngine.usage_engine === 'ccusage-rust'
            ? 'Codex 日志：ccusage Rust 解析与去重'
            : codexEngine.usage_engine_error
              ? 'ccusage Rust 引擎不可用，当前由兼容解析器提供本地数据'
              : 'Codex 日志：本地兼容解析器'}
        </div>
      )}

      <div className="usage-detail-grid usage-detail-grid--portfolio usage-detail-grid--single">
        <ModelList
          models={selectedUsage.models}
          monthModels={selectedUsage.models}
          title={`${selectedShortLabel}模型`}
        />
      </div>

      <UsageCharts
        models={selectedUsage.models}
        events={codexEngine?.events ?? []}
        dailyUsage={codexEngine?.daily_usage}
        periodLabel={selectedShortLabel}
      />

      <UsageEventAnalysis providers={providers} />

      <QuotaList buckets={data?.rate_limits} usedModels={codexModels} title="模型额度" />
    </div>
  );
}

function AnalysisMetric({ label, value, tokenValue }: { label: string; value: string; tokenValue?: number }) {
  const exactValue = tokenValue === undefined ? undefined : formatTokenExact(tokenValue);
  return (
    <div className="provider-analysis-metric">
      <span>{label}</span>
      <strong title={exactValue === '—' ? undefined : exactValue} aria-label={exactValue}>{value}</strong>
    </div>
  );
}
