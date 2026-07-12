import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AgentId, ProviderLocalUsage } from '../types';
import { agentMeta, COMPANY_LIST } from '../services/agentCatalog';

interface Props {
  active?: AgentId;
  onSelect?: (id: AgentId) => void;
  providers?: ProviderLocalUsage[];
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

/** Token / remote usage signal used for chip status + ranking. */
function usageScore(local: ProviderLocalUsage | undefined): number {
  if (!local) return 0;
  const remote = local.remote && !local.remote.error ? local.remote : null;
  // Official billed usage first (Grok monthly credits / week %, Mistral month tokens…).
  const remoteUsed = Math.max(
    remote?.monthly?.used ?? 0,
    remote?.primary?.limit ? remote.primary.percent : 0,
    remote?.secondary?.used ?? 0,
  );
  const monthTok = local.month?.tokens ?? 0;
  const todayTok = local.today?.tokens ?? 0;
  return Math.max(monthTok, todayTok, remoteUsed, local.hasTokens ? 1 : 0);
}

function statusFor(
  id: AgentId,
  local: ProviderLocalUsage | undefined,
): string {
  const meta = agentMeta(id);
  const hasTokens = !!local?.hasTokens;
  const remote = local?.remote && !local.remote.error ? local.remote : null;
  // Only show % when official limit is known (avoid fake 0% on free models without month cap).
  const remotePct = remote && remote.primary.limit > 0
    ? remote.primary.percent
    : null;
  const monthTok = remote?.primary?.used ?? local?.month.tokens ?? 0;
  if (remotePct != null) return `${Math.round(remotePct)}%`;
  if (monthTok > 0 || hasTokens) return fmtTok(monthTok);
  if (local?.available && local?.authOk) return '已登录';
  if (local?.available) return '就绪';
  if (meta.usageBackend === 'codex') return '额度';
  return '';
}

/**
 * Companies with captured tokens float to the top; ties keep COMPANY_LIST order.
 */
export function rankCompaniesByTokens(
  companies: readonly AgentId[],
  providers: ProviderLocalUsage[],
): AgentId[] {
  const byId = new Map(providers.map((p) => [p.provider, p]));
  const order = new Map(companies.map((id, i) => [id, i]));
  return [...companies].sort((a, b) => {
    const sa = usageScore(byId.get(a));
    const sb = usageScore(byId.get(b));
    if (sa > 0 && sb <= 0) return -1;
    if (sb > 0 && sa <= 0) return 1;
    // Both have tokens: higher burn first.
    if (sa !== sb) return sb - sa;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });
}

/**
 * Collapsed company picker: shows active company; expand vertically to switch.
 * Captured-token companies auto-pin to the top of the expanded list.
 */
export default function CompanyList({ active = 'codex', onSelect, providers = [] }: Props) {
  const [open, setOpen] = useState(false);
  const byId = useMemo(
    () => new Map(providers.map((p) => [p.provider, p])),
    [providers],
  );
  const ranked = useMemo(
    () => rankCompaniesByTokens(COMPANY_LIST, providers),
    [providers],
  );
  const activeMeta = agentMeta(active);
  const activeLocal = byId.get(active);
  const activeStatus = statusFor(active, activeLocal);

  // Close when selection changes (also covers outside re-render after pick).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`company-picker${open ? ' company-picker--open' : ''}`}>
      <button
        type="button"
        className="company-picker-trigger"
        aria-expanded={open}
        aria-controls="company-picker-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="company-chip-dot"
          style={{ background: activeMeta.color }}
          aria-hidden
        />
        <span className="company-picker-trigger-name">{activeMeta.company}</span>
        <span className="company-picker-trigger-product">{activeMeta.label}</span>
        {activeStatus && (
          <span className="company-chip-tag company-chip-tag--tok">{activeStatus}</span>
        )}
        <ChevronDown
          size={14}
          className={`company-picker-chevron${open ? ' company-picker-chevron--up' : ''}`}
          aria-hidden
        />
      </button>

      <div
        id="company-picker-panel"
        className="company-picker-panel"
        role="listbox"
        aria-label="选择公司"
        hidden={!open}
      >
        <div className="company-picker-panel-scroll">
          {ranked.map((id) => {
            const meta = agentMeta(id);
            const local = byId.get(id);
            const selected = active === id;
            const status = statusFor(id, local);
            const pinned = usageScore(local) > 0;

            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                className={[
                  'company-picker-item',
                  selected ? ' company-picker-item--active' : '',
                  pinned ? ' company-picker-item--pinned' : '',
                ].join('')}
                onClick={() => {
                  onSelect?.(id);
                  setOpen(false);
                }}
              >
                <span
                  className="company-chip-dot"
                  style={{ background: meta.color }}
                  aria-hidden
                />
                <span className="company-picker-item-text">
                  <span className="company-picker-item-name">{meta.company}</span>
                  <span className="company-picker-item-sub">{meta.fullName}</span>
                </span>
                {status && (
                  <span className="company-chip-tag company-chip-tag--tok">{status}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
