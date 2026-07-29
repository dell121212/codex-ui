import { useState, useEffect, useMemo } from 'react';

import { useStore } from '../store/usageStore';

import AppToolbar, { type WorkspaceId } from './AppToolbar';
import DashboardComposer from './DashboardComposer';
import ProvidersWorkspace from './ProvidersWorkspace';
import SetupBanner   from './SetupBanner';
import SettingsPanel from './SettingsPanel';
import UsageAnalysisWorkspace from './UsageAnalysisWorkspace';

const WORKSPACE_META: Record<WorkspaceId, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: 'Overview',
    title: '用量概览',
    description: '聚合本地 AI 工具的额度、成本与活跃模型。',
  },
  usage: {
    eyebrow: 'Analytics',
    title: '用量分析',
    description: '比较不同 Provider 的使用贡献与本月成本。',
  },
  providers: {
    eyebrow: 'Connections',
    title: 'Providers',
    description: '查看本地客户端连接、授权状态与数据来源。',
  },
  settings: {
    eyebrow: 'Preferences',
    title: '设置',
    description: '管理同步频率、登录态与通知偏好。',
  },
};

const COMPANIONS = [
  { id: 'paimon', name: '派蒙', src: '/assets/game-ui/character-paimon.png' },
  { id: 'klee', name: '可莉', src: '/assets/companions/klee.png' },
  { id: 'nahida', name: '纳西妲', src: '/assets/companions/nahida.png' },
  { id: 'sayu', name: '早柚', src: '/assets/companions/sayu.png' },
] as const;

export default function Popover() {
  const [workspace, setWorkspace] = useState<WorkspaceId>(initialPreviewWorkspace);
  const [companionId, setCompanionId] = useState<(typeof COMPANIONS)[number]['id']>('paimon');
  const [companionMotion, setCompanionMotion] = useState<'float' | 'sway' | 'cheer'>('float');
  const { data, isRefreshing, refresh, lastUpdated, error, errorKind, checkFirstLaunch } = useStore();

  useEffect(() => {
    checkFirstLaunch().then(first => {
      if (first) setWorkspace('settings');
    }).catch(() => {});
  }, [checkFirstLaunch]);

  useEffect(() => {
    const motions = ['float', 'sway', 'cheer'] as const;
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % motions.length;
      setCompanionMotion(motions[index]);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const localProviders = useMemo(
    () => data?.local_providers ?? [],
    [data?.local_providers],
  );
  const workspaceMeta = WORKSPACE_META[workspace];
  return (
    <div className="app-shell">
      <AppToolbar
        activeWorkspace={workspace}
        lastUpdated={lastUpdated}
        isRefreshing={isRefreshing}
        hasError={!!errorKind}
        onSelectWorkspace={setWorkspace}
        onRefresh={refresh}
      />

      <main className="workspace-shell">
        <div className="workspace-scroll" id="main-scroll">
          <div className="workspace-content">
            <header className="workspace-header">
              <div>
                <span className="workspace-eyebrow">{workspaceMeta.eyebrow}</span>
                <h1>{workspaceMeta.title}</h1>
                <p>{workspaceMeta.description}</p>
              </div>
              {workspace === 'overview' && (
                <div className="workspace-companion-area">
                  <div className="workspace-companion-picker" aria-label="选择陪伴角色">
                    {COMPANIONS.map((companion) => (
                      <button
                        key={companion.id}
                        type="button"
                        className={`workspace-companion-choice${companion.id === companionId ? ' is-active' : ''}`}
                        onClick={() => setCompanionId(companion.id)}
                        aria-label={`选择${companion.name}`}
                        title={companion.name}
                      >
                        <img src={companion.src} alt="" />
                      </button>
                    ))}
                  </div>
                  <div className={`workspace-mascot companion-motion--${companionMotion}`} aria-hidden="true">
                    <img src={COMPANIONS.find((companion) => companion.id === companionId)?.src ?? COMPANIONS[0].src} alt="" />
                    <span>今日也要好好管理额度哦</span>
                  </div>
                </div>
              )}
              {workspace !== 'settings' && (
                <span className="workspace-provider-count">
                  {localProviders.length || 6} 个 Provider
                </span>
              )}
            </header>

            {workspace === 'overview' && (
              <div className="overview-workspace">
                <SetupBanner
                  errorKind={errorKind}
                  error={data?.error ?? error}
                  onOpenSettings={() => setWorkspace('settings')}
                />
                <DashboardComposer
                  data={data}
                  providers={localProviders}
                />
              </div>
            )}

            {workspace === 'usage' && (
              <UsageAnalysisWorkspace
                data={data}
                providers={localProviders}
              />
            )}

            {workspace === 'providers' && (
              <ProvidersWorkspace
                providers={localProviders}
                onOpenProvider={() => setWorkspace('usage')}
              />
            )}

            {workspace === 'settings' && <SettingsPanel embedded />}
          </div>
        </div>
      </main>
    </div>
  );
}

function initialPreviewWorkspace(): WorkspaceId {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 'overview';
  const requested = new URLSearchParams(window.location.search).get('workspace');
  return requested === 'usage' || requested === 'providers' || requested === 'settings'
    ? requested
    : 'overview';
}
