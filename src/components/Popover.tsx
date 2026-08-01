import { useState, useEffect, useMemo } from 'react';

import { useStore } from '../store/usageStore';

import AppToolbar, { type WorkspaceId } from './AppToolbar';
import DashboardComposer from './DashboardComposer';
import ProvidersWorkspace from './ProvidersWorkspace';
import SetupBanner   from './SetupBanner';
import SettingsPanel from './SettingsPanel';
import UsageAnalysisWorkspace from './UsageAnalysisWorkspace';
import WorkspaceCompanion from './WorkspaceCompanion';

const WORKSPACE_META: Record<WorkspaceId, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: 'Overview',
    title: '用量概览',
    description: '聚合本地 AI 工具的额度、成本与活跃模型。',
  },
  usage: {
    eyebrow: 'Analytics',
    title: '用量与成本',
    description: '跨 Provider 对比',
  },
  providers: {
    eyebrow: 'Connections',
    title: '连接状态',
    description: 'Provider 授权与来源',
  },
  settings: {
    eyebrow: 'Preferences',
    title: '设置',
    description: '管理同步频率、登录态与通知偏好。',
  },
};

export default function Popover() {
  const [workspace, setWorkspace] = useState<WorkspaceId>(initialPreviewWorkspace);
  const { data, isRefreshing, refresh, lastUpdated, error, errorKind, checkFirstLaunch } = useStore();

  useEffect(() => {
    checkFirstLaunch().then(first => {
      if (first) setWorkspace('settings');
    }).catch(() => {});
  }, [checkFirstLaunch]);

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
            <header className={`workspace-header${workspace === 'overview' ? ' workspace-header--overview' : ''}`}>
              <div className="workspace-title-block">
                {workspace !== 'overview' && (
                  <span className="workspace-eyebrow">{workspaceMeta.eyebrow}</span>
                )}
                <div className="workspace-title-row">
                  <h1>{workspaceMeta.title}</h1>
                  {workspace === 'overview' && (
                    <span className="workspace-provider-count">
                      {localProviders.length || 6} 个 Provider
                    </span>
                  )}
                </div>
                {workspace !== 'overview' && <p>{workspaceMeta.description}</p>}
              </div>
              {workspace === 'overview' && (
                <WorkspaceCompanion
                  data={data}
                  providerCount={localProviders.length || 6}
                />
              )}
              {workspace !== 'overview' && workspace !== 'settings' && (
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
