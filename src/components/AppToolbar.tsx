import {
  BarChart3,
  Blocks,
  LayoutDashboard,
  RefreshCw,
  Settings2,
} from 'lucide-react';

export type WorkspaceId = 'overview' | 'usage' | 'providers' | 'settings';

interface Props {
  activeWorkspace: WorkspaceId;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  hasError: boolean;
  onSelectWorkspace: (workspace: WorkspaceId) => void;
  onRefresh: () => void;
}

const NAV_ITEMS = [
  { id: 'overview' as const, label: '概览', icon: LayoutDashboard },
  { id: 'usage' as const, label: '用量分析', icon: BarChart3 },
  { id: 'providers' as const, label: 'Providers', icon: Blocks },
  { id: 'settings' as const, label: '设置', icon: Settings2 },
];

function timeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return '刚刚更新';
  if (seconds < 60) return `${seconds} 秒前更新`;
  return `${Math.floor(seconds / 60)} 分钟前更新`;
}

export default function AppToolbar({
  activeWorkspace,
  lastUpdated,
  isRefreshing,
  hasError,
  onSelectWorkspace,
  onRefresh,
}: Props) {
  const syncLabel = hasError
    ? '同步异常'
    : lastUpdated
      ? timeAgo(lastUpdated)
      : '正在同步';

  return (
    <header className="app-toolbar">
      <div className="app-toolbar-drag-region" data-drag-region>
        <span className="app-mark app-toolbar-mark" aria-hidden><i /><i /></span>
      </div>

      <nav className="app-toolbar-nav" aria-label="工作区">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`app-toolbar-nav-item${activeWorkspace === id ? ' app-toolbar-nav-item--active' : ''}`}
            onClick={() => onSelectWorkspace(id)}
          >
            <Icon size={15} strokeWidth={1.8} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="app-toolbar-actions" data-no-drag>
        <span
          className={`app-toolbar-health${hasError ? ' app-toolbar-health--warning' : ''}`}
          title={syncLabel}
          aria-label={syncLabel}
          role="status"
        />
        <button
          type="button"
          className="app-toolbar-button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="刷新"
          title="刷新"
        >
          <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin .8s linear infinite' : 'none' }} />
        </button>
        <button
          type="button"
          className="app-toolbar-button"
          onClick={() => onSelectWorkspace('settings')}
          aria-label="设置"
          title="设置"
        >
          <Settings2 size={15} />
        </button>
      </div>
    </header>
  );
}
