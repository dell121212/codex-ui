import type { ProviderLocalUsage } from '../types';
import { usageHeatColor } from '../services/usageLogic';

interface Props {
  local?: ProviderLocalUsage;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtReset(secs: number): string {
  if (secs <= 0) return '即将重置';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时后重置`;
  if (h > 0) return `${h}小时 ${m}分钟后重置`;
  return `${m}分钟后重置`;
}

function productPercent(
  products: Array<{ product: string; percent: number }>,
  pattern: RegExp,
): number | null {
  const hit = products.find((p) => pattern.test(p.product));
  return hit ? hit.percent : null;
}

/**
 * Grok / xAI — official billing only.
 *
 * Source: cli-chat-proxy.grok.com
 *   GET /v1/billing?format=credits  → weekly credit % + Build/Chat product %
 *   GET /v1/billing                → monthly used / monthlyLimit (credit units)
 *
 * Local session totalTokens / contextTokensUsed are context-window size and are
 * NOT shown as API quota consumption.
 */
export default function GrokPanel({ local }: Props) {
  const remote = local?.remote;
  const hasRemote = !!remote && !remote.error;
  const hasActivity = !!local?.hasTokens || !!local?.lastActiveAt;

  const weekPct = hasRemote ? remote.primary.percent : null;
  const buildPct = hasRemote ? productPercent(remote.products, /build/i) : null;
  const chatPct = hasRemote ? productPercent(remote.products, /chat/i) : null;
  const resetSecs = hasRemote ? remote.primary.remaining_secs : 0;

  const monthUsed = hasRemote
    ? (remote.monthly?.used ?? remote.secondary.used)
    : null;
  const monthLimit = hasRemote
    ? (remote.monthly?.limit ?? remote.secondary.limit)
    : null;
  const hasMonth = monthUsed != null && monthLimit != null && monthLimit > 0;
  const monthPct = hasMonth
    ? Math.min(100, (monthUsed / monthLimit) * 100)
    : null;

  if (!hasRemote && !hasActivity) {
    return (
      <div className="card company-status">
        <p className="company-placeholder-copy">
          {local?.available
            ? local.authOk
              ? '已发现 ~/.grok。正在读取官方 billing 额度…'
              : '已发现 ~/.grok，请先 grok login 后刷新。'
            : '尚未发现 ~/.grok。'}
        </p>
        {remote?.error && (
          <div className="company-placeholder-hint" style={{ color: 'var(--orange)' }}>
            {remote.error}
          </div>
        )}
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

      {hasRemote && (
        <div className="card grok-quota">
          <div className="card-label">周额度</div>
          <div className="grok-quota-head">
            <span className="grok-quota-pct">{Math.round(weekPct ?? 0)}%</span>
            <span className="grok-quota-reset">
              {resetSecs > 0 ? fmtReset(resetSecs) : '官方 /v1/billing'}
            </span>
          </div>
          <div className="progress-bg grok-quota-bar">
            <div
              className="progress-fill"
              style={{
                width: `${weekPct ?? 0}%`,
                background: usageHeatColor(weekPct ?? 0),
              }}
            />
          </div>

          <div className="grok-product-grid">
            <UsageBar label="Build" percent={buildPct} />
            <UsageBar label="Chat" percent={chatPct} />
          </div>
        </div>
      )}

      {hasMonth && (
        <div className="card weekly-card">
          <div className="weekly-header">
            <span className="card-label" style={{ marginBottom: 0 }}>月额度</span>
            <span className="weekly-pct">{Math.round(monthPct ?? 0)}%</span>
          </div>
          <div className="progress-bg" style={{ marginTop: 8, marginBottom: 10 }}>
            <div
              className="progress-fill"
              style={{
                width: `${monthPct ?? 0}%`,
                background: usageHeatColor(monthPct ?? 0),
              }}
            />
          </div>
          <div className="stat-list">
            <div className="stat-row">
              <span className="stat-label">已用</span>
              <span className="stat-value">{fmtNum(monthUsed)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">上限</span>
              <span className="stat-value">{fmtNum(monthLimit)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">剩余</span>
              <span className="stat-value">{fmtNum(Math.max(0, monthLimit - monthUsed))}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">来源</span>
              <span className="stat-value">官方 billing</span>
            </div>
          </div>
        </div>
      )}

      {!hasRemote && hasActivity && (
        <div className="card company-status">
          <p className="company-placeholder-copy">
            本地有 Grok 会话活动，但官方额度尚未拉到。请确认已 login 且网络可达 cli-chat-proxy.grok.com。
          </p>
        </div>
      )}
    </>
  );
}

function UsageBar({ label, percent }: { label: string; percent: number | null }) {
  const pct = percent ?? 0;
  const known = percent != null;
  return (
    <div className="grok-usage-bar">
      <div className="grok-usage-bar-head">
        <span className="grok-usage-bar-label">{label}</span>
        <span className="grok-usage-bar-pct">{known ? `${Math.round(pct)}%` : '—'}</span>
      </div>
      <div className="progress-bg">
        <div
          className="progress-fill"
          style={{
            width: `${known ? pct : 0}%`,
            background: usageHeatColor(pct),
          }}
        />
      </div>
    </div>
  );
}
