import type { PeriodUsage, ProviderLocalUsage, SpendInfo } from '../types';
import { computeSpend, usageHeatColor } from '../services/usageLogic';
import ModelList from './ModelList';

interface Props {
  local?: ProviderLocalUsage;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function todaySpendUsd(today?: PeriodUsage): number {
  return today?.models.reduce((sum, m) => sum + (m.cost_usd ?? 0), 0) ?? 0;
}

/**
 * Mistral board — account token quota (not session context window).
 *
 * Free / API Free: monthly tokens when x-ratelimit-*-tokens-month is present;
 * otherwise local calendar-month burn + optional minute TPM bar.
 */
export default function MistralPanel({ local }: Props) {
  const hasTokens = !!local?.hasTokens;
  const remote = local?.remote;
  const month = local?.month;
  const today = local?.today;

  // Prefer official month window; fall back to local calendar-month tokens.
  const monthUsed = remote?.primary?.used
    ?? remote?.monthly?.used
    ?? month?.tokens
    ?? 0;
  const monthLimit = remote?.primary?.limit
    ?? remote?.monthly?.limit
    ?? 0;
  const hasMonthLimit = monthLimit > 0;
  const monthPct = hasMonthLimit
    ? Math.min(100, (monthUsed / monthLimit) * 100)
    : 0;

  const minute = remote?.secondary?.limit ? remote.secondary : null;
  const planLabel = remote?.plan_label ?? 'API Free';
  const spend: SpendInfo | undefined = month ? computeSpend(month) : undefined;
  const todayUsd = todaySpendUsd(today);
  const monthUsd = month?.models.reduce((s, m) => s + (m.cost_usd ?? 0), 0)
    ?? spend?.month_total_usd
    ?? 0;

  const showAnything = hasMonthLimit || hasTokens || !!minute || !!local?.available;

  if (!showAnything) {
    return (
      <div className="card company-status">
        <p className="company-placeholder-copy">
          {local?.available
            ? local.authOk
              ? '已发现 ~/.vibe 与 API Key。运行 vibe 产生会话后会显示本月 Token。'
              : '已发现 ~/.vibe，但未检测到 MISTRAL_API_KEY（~/.vibe/.env）。'
            : '尚未发现 ~/.vibe。安装 Mistral Vibe 后会自动接入。'}
        </p>
      </div>
    );
  }

  return (
    <>
      {remote?.error && (
        <div
          className="setup-banner"
          style={{
            background: 'rgba(255,159,10,.10)',
            border: '0.5px solid rgba(255,159,10,.30)',
            color: '#ff9f0a',
          }}
        >
          额度接口：{remote.error}
        </div>
      )}

      <div className="card grok-quota" style={{
        background:
          'radial-gradient(120% 90% at 0% 0%, rgba(249,115,22,0.14) 0%, transparent 55%), var(--bg1)',
      }}>
        <div className="card-label">月 Token</div>
        <div className="grok-quota-head">
          {hasMonthLimit ? (
            <span className="grok-quota-pct">{Math.round(monthPct)}%</span>
          ) : (
            <span className="grok-quota-pct">{fmtTok(monthUsed)}</span>
          )}
          <span className="grok-quota-reset">
            {hasMonthLimit ? planLabel : `${planLabel} · 本模型无月上限`}
          </span>
        </div>
        {hasMonthLimit && (
          <div className="progress-bg grok-quota-bar">
            <div
              className="progress-fill"
              style={{ width: `${monthPct}%`, background: usageHeatColor(monthPct) }}
            />
          </div>
        )}
        <div className="stat-list" style={{ marginTop: 8 }}>
          <div className="stat-row">
            <span className="stat-label">已用</span>
            <span className="stat-value">{fmtTok(monthUsed)}</span>
          </div>
          {hasMonthLimit ? (
            <>
              <div className="stat-row">
                <span className="stat-label">上限</span>
                <span className="stat-value">{fmtTok(monthLimit)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">剩余</span>
                <span className="stat-value">{fmtTok(Math.max(0, monthLimit - monthUsed))}</span>
              </div>
            </>
          ) : (
            <div className="stat-row">
              <span className="stat-label">来源</span>
              <span className="stat-value">
                {remote?.source?.includes('api-ratelimit')
                  ? '官方头 + 本地会话'
                  : '本地会话 · 本月'}
              </span>
            </div>
          )}
        </div>
      </div>

      {minute && minute.limit > 0 && (
        <div className="card weekly-card">
          <div className="weekly-header">
            <span className="card-label" style={{ marginBottom: 0 }}>分钟 Token</span>
            <span className="weekly-pct">{Math.round(minute.percent)}%</span>
          </div>
          <div className="progress-bg" style={{ marginTop: 8, marginBottom: 10 }}>
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, minute.percent)}%`,
                background: usageHeatColor(minute.percent),
              }}
            />
          </div>
          <div className="stat-list">
            <div className="stat-row">
              <span className="stat-label">已用</span>
              <span className="stat-value">{fmtTok(minute.used)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">上限</span>
              <span className="stat-value">{fmtTok(minute.limit)}/min</span>
            </div>
          </div>
        </div>
      )}

      <div className="metrics-row grok-metrics">
        <div className="card spend-card">
          <div className="card-label">今日</div>
          <div className="spend-amount">{fmtTok(today?.tokens ?? 0)}</div>
          <div className="spend-period">Token</div>
        </div>

        <div className="card spend-card">
          <div className="card-label">估价</div>
          <div className="spend-amount">~${monthUsd.toFixed(2)}</div>
          <div className="spend-period">本月会话</div>
          <div className="stat-list" style={{ marginTop: 4 }}>
            <div className="stat-row">
              <span className="stat-label">今日</span>
              <span className="stat-value">~${todayUsd.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {(hasTokens || (month?.models.length ?? 0) > 0) && (
        <ModelList
          models={today?.models}
          monthModels={month?.models}
        />
      )}
    </>
  );
}
