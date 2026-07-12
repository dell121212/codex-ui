import type { AgentId } from '../types';
import { agentMeta, USAGE_PROVIDER_TABS } from '../services/agentCatalog';

interface Props {
  active: AgentId;
  onChange: (id: AgentId) => void;
}

/** Usage-page engine switcher: Codex shows live quota; others open that engine's board snapshot. */
export default function ProviderTabs({ active, onChange }: Props) {
  return (
    <div className="provider-tabs" role="tablist" aria-label="引擎">
      {USAGE_PROVIDER_TABS.map((id) => {
        const meta = agentMeta(id);
        const live = meta.usageBackend === 'codex';
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            className={`tab-btn${active === id ? ' tab-btn--active' : ''}${live ? ' tab-btn--live' : ''}`}
            onClick={() => onChange(id)}
            title={live ? `${meta.fullName} · 实时额度` : `${meta.fullName} · 看板任务`}
          >
            <span
              className="tab-btn-dot"
              style={{ background: meta.color }}
              aria-hidden
            />
            {meta.label}
            {live && <span className="tab-btn-tag tab-btn-tag--live">额度</span>}
          </button>
        );
      })}
    </div>
  );
}
