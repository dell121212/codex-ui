import { useState, useEffect, useMemo } from 'react';

import { useStore } from '../store/usageStore';

import AppToolbar, { type WorkspaceId } from './AppToolbar';
import DashboardComposer from './DashboardComposer';
import ProvidersWorkspace from './ProvidersWorkspace';
import SetupBanner   from './SetupBanner';
import SettingsPanel from './SettingsPanel';
import UsageAnalysisWorkspace from './UsageAnalysisWorkspace';

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
