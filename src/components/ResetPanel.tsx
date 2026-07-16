import { useState, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { BankedResets } from '../types';
import { useStore } from '../store/usageStore';

interface Props {
  banked?: BankedResets;
  embedded?: boolean;
  compact?: boolean;
}

const MAX_DOTS = 5; // visual cap for the indicator row

export default function ResetPanel({ banked, embedded = false, compact = false }: Props) {
  const { executeReset } = useStore();
  const [loading, setLoading]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending feedback timer on unmount
  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!showConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showConfirm]);

  const available    = banked?.available ?? null;
  const hasAvailable = available != null && available > 0;
  const lifetimeUsed = banked?.lifetime_used ?? 0;
  const visibleSlots = hasAvailable ? Math.min(available, MAX_DOTS) : 0;

  const handleReset = () => {
    if (loading || !hasAvailable) return;
    setShowConfirm(true);
  };

  const confirmReset = async () => {
    if (loading) return;
    setShowConfirm(false);
    setLoading(true);
    setFeedback(null);
    const outcome = await executeReset(banked?.credits[0]?.id);
    setLoading(false);
    const result = {
      reset: { ok: true, msg: '额度窗口已重置' },
      alreadyRedeemed: { ok: true, msg: '这次重置已经生效' },
      nothingToReset: { ok: false, msg: '当前窗口不符合重置条件' },
      noCredit: { ok: false, msg: '账户没有可用重置次数' },
      failed: { ok: false, msg: '重置请求失败，请稍后重试' },
    }[outcome];
    setFeedback(result);
    // Auto-clear feedback after 4 s
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
  };

  const lastReset = banked?.last_reset_at
    ? new Date(banked.last_reset_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`${embedded ? '' : 'card '}reset-panel${embedded ? ' reset-panel--embedded' : ''}${compact ? ' reset-panel--compact' : ''}`}>
      {/* Header row */}
      <div className="reset-header">
        <div className="reset-meta">
          <div className="reset-title">
            <RotateCcw size={12} aria-hidden />
            <span>手动重置</span>
            {embedded && <strong>{available == null ? '—' : available} 次</strong>}
          </div>
          <div className="reset-subtitle">
            {embedded
              ? available == null
                ? '重置次数暂不可用'
                : `可用次数 · 累计已用 ${lifetimeUsed} 次`
              : hasAvailable
                ? `可用 ${available} 次 · 累计已用 ${lifetimeUsed} 次`
                : available === 0 ? `可用 0 次 · 累计已用 ${lifetimeUsed} 次` : '重置次数暂不可用'}
          </div>
          {lastReset && (
            <div className="reset-last">上次重置：{lastReset}</div>
          )}
        </div>

        <button
          className="reset-btn"
          onClick={handleReset}
          disabled={loading || !hasAvailable}
          aria-label={hasAvailable ? `重置额度窗口，剩余 ${available} 次` : '尝试重置额度窗口'}
        >
          {loading ? '重置中…' : hasAvailable ? compact ? '重置' : '重置窗口' : '暂无额度'}
        </button>
      </div>

      {showConfirm && (
        <div
          className="confirm-backdrop"
          role="presentation"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            onClick={e => e.stopPropagation()}
          >
            <div id="reset-confirm-title" className="confirm-title">确认手动重置？</div>
            <div className="confirm-copy">
              这会消耗一次官方额度重置次数，并重置当前符合条件的窗口。请仅在确实需要立即恢复额度时执行。
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>
                取消
              </button>
              <button className="btn-confirm-danger" onClick={confirmReset} disabled={loading}>
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dot indicator row */}
      {!embedded && (
        <div className="reset-dots" aria-label={hasAvailable ? `当前可用 ${available} 次` : '当前没有可用重置次数'}>
          {Array.from({ length: visibleSlots }).map((_, i) => (
            <div
              key={i}
              className="reset-dot"
              style={{
                background: hasAvailable && i < available ? '#ff9f0a' : 'var(--sep)',
                transition: 'background 300ms ease',
              }}
            />
          ))}
          <span className="reset-dot-label">
            {available == null ? '未知' : `${available} 次`}
          </span>
        </div>
      )}

      {/* Inline feedback */}
      {feedback && (
        <div
          className="reset-feedback"
          style={{ color: feedback.ok ? '#30d158' : '#ff453a' }}
          role="status"
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
