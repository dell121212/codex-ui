import { Button } from '@appica/ui-react/button';
import { useState } from 'react';
import type { PeriodUsage } from '../types';
import { formatTokenExact, formatTokenWithUnit } from '../services/tokenDisplay';
import { useStore } from '../store/usageStore';
import { readLocalTokenSubtotalCheckpoint } from '../services/localTokenSubtotal';

export default function TokenSubtotalPanel({ usage }: { usage?: PeriodUsage }) {
  const { resetLocalSubtotal } = useStore();
  const tokens = usage?.tokens;
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);
  const checkpoint = readLocalTokenSubtotalCheckpoint();
  const checkpointCopy = checkpoint
    ? `上次归零：${new Date(checkpoint * 1000).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    : '尚未归零';

  const clearSubtotal = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback(null);
    const didReset = await resetLocalSubtotal();
    setFeedback(didReset ? 'success' : 'error');
    setLoading(false);
  };

  return (
    <section className="card token-subtotal-panel" aria-label="本地 Token 小计">
      <div>
        <span>本地小计</span>
        <strong
          title={formatTokenExact(tokens) === '—' ? undefined : formatTokenExact(tokens)}
          aria-label={`本地 Token 小计 ${formatTokenExact(tokens)}`}
        >
          {formatTokenWithUnit(tokens)}
        </strong>
        <small title="仅统计 checkpoint 后的本地 Token，不影响官方额度。">{checkpointCopy}</small>
      </div>
      <Button
        type="button"
        className="token-subtotal-reset"
        variant="outline"
        size="sm"
        onClick={() => void clearSubtotal()}
        disabled={loading}
        aria-label="清零本地小计，不影响官方额度"
      >
        {loading ? '清零中…' : '清零'}
      </Button>
      {feedback && (
        <span className={`token-subtotal-feedback token-subtotal-feedback--${feedback}`} role="status">
          {feedback === 'success' ? '本地小计已归零' : '无法保存本地小计 checkpoint，请检查本地存储。'}
        </span>
      )}
    </section>
  );
}
