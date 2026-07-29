import {
  BarChart3,
  Blocks,
  ChevronRight,
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
    <aside className="app-toolbar">
      <div className="app-toolbar-brand" data-drag-region>
        <span className="app-mark app-toolbar-mark" aria-hidden><i /><i /></span>
        <span className="app-toolbar-brand-copy">
          <strong>AI Console</strong>
          <small>本地用量工作区</small>
        </span>
      </div>

      <div className="app-toolbar-section-label">工作区</div>
      <nav className="app-toolbar-nav" aria-label="工作区">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`app-toolbar-nav-item${activeWorkspace === id ? ' app-toolbar-nav-item--active' : ''}`}
            onClick={() => onSelectWorkspace(id)}
            aria-current={activeWorkspace === id ? 'page' : undefined}
          >
            <Icon size={16} strokeWidth={1.7} aria-hidden />
            <span>{label}</span>
            <ChevronRight className="app-toolbar-nav-chevron" size={13} aria-hidden />
          </button>
        ))}
      </nav>

      <div className="app-toolbar-footer" data-no-drag>
        <div className="app-toolbar-sync" role="status" aria-label={syncLabel}>
          <span className={`app-toolbar-health${hasError ? ' app-toolbar-health--warning' : ''}`} />
          <span>
            <strong>{hasError ? '同步需要处理' : '数据已连接'}</strong>
            <small>{syncLabel}</small>
          </span>
          <button
            type="button"
            className="app-toolbar-button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="刷新"
            title="刷新"
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin .8s linear infinite' : 'none' }} />
          </button>
        </div>
        <button
          type="button"
          className={`app-toolbar-settings-row${activeWorkspace === 'settings' ? ' app-toolbar-settings-row--active' : ''}`}
          onClick={() => onSelectWorkspace('settings')}
          aria-current={activeWorkspace === 'settings' ? 'page' : undefined}
        >
          <Settings2 size={16} strokeWidth={1.7} />
          <span>偏好设置</span>
          <ChevronRight size={13} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
