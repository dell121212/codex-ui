import { Minus, RefreshCw, Settings } from 'lucide-react';
import { hideWindow } from '../services/neutralinoBackend';

interface Props {
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  lastUpdated: Date | null;
  hasError?: boolean;
}

function timeAgo(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5)  return '刚刚';
  if (secs < 60) return `${secs} 秒前`;
  return `${Math.floor(secs / 60)} 分钟前`;
}

export default function Header({ isRefreshing, onRefresh, onOpenSettings, lastUpdated, hasError }: Props) {
  return (
    <div className="header">
      <div className="header-left header-drag-region">
        <div className={`status-dot ${hasError ? 'status-dot--warn' : ''}`} />
        <span className="header-title">Codex 用量</span>
        {lastUpdated && (
          <span className="header-time">{timeAgo(lastUpdated)}</span>
        )}
      </div>

      <div className="header-right">
        <button
          className="icon-btn"
          onClick={() => hideWindow()}
          title="最小化到托盘"
          aria-label="最小化到托盘"
        >
          <Minus size={13} />
        </button>
        <button
          className="icon-btn"
          onClick={onRefresh}
          title="刷新"
          aria-label="刷新用量数据"
          disabled={isRefreshing}
        >
          <RefreshCw
            size={13}
            style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}
          />
        </button>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="设置"
          aria-label="打开设置"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}
