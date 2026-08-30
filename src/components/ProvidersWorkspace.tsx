import { ArrowUpRight, CircleAlert, CircleCheck, HardDrive } from 'lucide-react';
import type { AgentId, ProviderLocalUsage } from '../types';
import { agentMeta, COMPANY_LIST } from '../services/agentCatalog';
import { formatTokenExact, formatTokenM } from '../services/tokenDisplay';

interface Props {
  providers: ProviderLocalUsage[];
  onOpenProvider: (provider: AgentId) => void;
}

export default function ProvidersWorkspace({ providers, onOpenProvider }: Props) {
  const byId = new Map(providers.map((provider) => [provider.provider, provider]));
  const connected = providers.filter((provider) => provider.available || provider.authOk).length;

  return (
    <div className="providers-workspace">
      <section className="workspace-summary-strip">
        <div>
          <span>已连接</span>
          <strong>{connected}</strong>
        </div>
        <div>
          <span>已捕获</span>
          <strong>{providers.filter((provider) => provider.hasTokens).length}</strong>
        </div>
        <div>
          <span>目录</span>
          <strong>{COMPANY_LIST.length}</strong>
        </div>
      </section>

      <section className="provider-table" aria-label="Provider 连接列表">
        <div className="provider-table-head">
          <span>Provider</span>
          <span>状态</span>
          <span>本月</span>
          <span>来源</span>
          <span />
        </div>

        {COMPANY_LIST.map((id) => {
          const meta = agentMeta(id);
          const local = byId.get(id);
          const remoteOk = !!local?.remote && !local.remote.error;
          const connectedNow = !!local?.authOk || remoteOk;
          const statusLabel = remoteOk ? '官方额度' : connectedNow ? '已登录' : local?.available ? '本地可用' : '未连接';
          const monthTokens = local?.month?.tokens ?? 0;
          const monthTokenExact = formatTokenExact(monthTokens);
          return (
            <div className="provider-table-row" key={id}>
              <div className="provider-table-identity">
                <span className="provider-table-badge" style={{ '--provider-color': meta.color } as React.CSSProperties}>
                  {meta.badge}
                </span>
                <span>
                  <strong title={meta.fullName}>{meta.fullName}</strong>
                  <small>{meta.company}</small>
                </span>
              </div>
              <div className={`provider-connection provider-connection--${remoteOk || connectedNow ? 'ok' : local?.available ? 'local' : 'off'}`}>
                {remoteOk || connectedNow ? <CircleCheck size={14} /> : local?.available ? <HardDrive size={14} /> : <CircleAlert size={14} />}
                {statusLabel}
              </div>
              <div className="provider-table-usage">
                <strong title={monthTokenExact} aria-label={monthTokenExact}>{formatTokenM(monthTokens)}</strong>
                <small>Token</small>
              </div>
              <div className="provider-table-source" title={local?.remote?.source ?? (local?.available ? meta.localHint : '—')}>
                {local?.remote?.source ?? (local?.available ? meta.localHint : '—')}
              </div>
              <button className="provider-open-button" onClick={() => onOpenProvider(id)} aria-label={`打开 ${meta.fullName}`}>
                <ArrowUpRight size={15} />
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
