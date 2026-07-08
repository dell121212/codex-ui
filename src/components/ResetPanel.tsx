import { useState, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { BankedResets } from '../types';
import { useStore } from '../store/usageStore';

interface Props {
  banked?: BankedResets;
}

const MAX_DOTS = 5; // visual cap for the indicator row

export default function ResetPanel({ banked }: Props) {
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

  const handleReset = async () => {
    if (loading) return;
    setShowConfirm(true);
  };

  const confirmReset = async () => {
    if (loading) return;
    setShowConfirm(false);
    setLoading(true);
    setFeedback(null);
    const ok = await executeReset();
    setLoading(false);
    setFeedback(
      ok
        ? { ok: true,  msg: '5 小时窗口已重置' }
        : { ok: false, msg: '重置失败，请在终端尝试 codex /reset' }
    );
    // Auto-clear feedback after 4 s
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
  };

  const lastReset = banked?.last_reset_at
    ? new Date(banked.last_reset_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="card reset-panel">
      {/* Header row */}
      <div className="reset-header">
        <div className="reset-meta">
          <div className="reset-title">
            <RotateCcw size={12} aria-hidden />
            <span>手动重置</span>
          </div>
          <div className="reset-subtitle">
            {hasAvailable
              ? `可用 ${available} 次 · 累计已用 ${lifetimeUsed} 次`
              : '未识别到可用重置次数'}
          </div>
          {lastReset && (
            <div className="reset-last">上次重置：{lastReset}</div>
          )}
        </div>

        <button
          className="reset-btn"
          onClick={handleReset}
          disabled={loading}
          aria-label={hasAvailable ? `重置 5 小时窗口，剩余 ${available} 次` : '尝试重置 5 小时窗口'}
        >
          {loading ? '重置中…' : hasAvailable ? '重置窗口' : '尝试重置'}
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
              这会消耗一次 5 小时窗口重置额度。只有确定需要立即恢复窗口时才执行。
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
      <div className="reset-dots" aria-label={hasAvailable ? `当前可用 ${available} 次` : '未识别到可用重置次数'}>
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
          {hasAvailable ? `${available} 次` : '未识别'}
        </span>
      </div>

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
