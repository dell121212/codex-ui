import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';

import { useStore }      from '../store/usageStore';
import { quitApp } from '../services/neutralinoBackend';

import Header        from './Header';
import RingCard      from './RingCard';
import WeeklyCard    from './WeeklyCard';
import ResetPanel    from './ResetPanel';
import ModelList     from './ModelList';
import SpendCard     from './SpendCard';
import SetupBanner   from './SetupBanner';
import SettingsPanel from './SettingsPanel';

export default function Popover() {
  const [showSettings, setShowSettings] = useState(false);
  const { data, isRefreshing, refresh, lastUpdated, error, errorKind, checkFirstLaunch } = useStore();

  // Open settings automatically when neither Codex auth nor fallback cookie is configured.
  useEffect(() => {
    checkFirstLaunch().then(first => {
      if (first) setShowSettings(true);
    }).catch(() => {});
  }, [checkFirstLaunch]);

  if (showSettings) {
    return (
      <div className="popover">
        <SettingsPanel onClose={() => {
          setShowSettings(false);
          refresh(); // re-fetch after potential cookie change
        }} />
      </div>
    );
  }

  return (
    <div className="popover">
      <Header
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        lastUpdated={lastUpdated}
        onOpenSettings={() => setShowSettings(true)}
        hasError={!!errorKind}
      />

      <div className="popover-body">
        <SetupBanner
          errorKind={errorKind}
          error={data?.error ?? error}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* Top row: 5h ring + right column */}
        <div className="metrics-row">
          <RingCard window={data?.window_5h} />
          <div className="right-col">
            <WeeklyCard window={data?.window_weekly} />
            <SpendCard  spend={data?.spend} today={data?.today_local} month={data?.month_local} />
          </div>
        </div>

        <ResetPanel banked={data?.banked_resets} />

        <ModelList models={data?.today_local.models} />

        <div className="footer">
          <button
            className="btn-danger"
            onClick={() => quitApp()}
            aria-label="退出"
          >
            <LogOut size={12} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
