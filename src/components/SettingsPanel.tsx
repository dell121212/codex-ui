import { useState, useEffect, useCallback } from 'react';
import { Button } from '@appica/ui-react/button';
import { Switch } from '@appica/ui-react/switch';
import { Toggle } from '@appica/ui-react/toggle';
import { ToggleGroup } from '@appica/ui-react/toggle-group';
import { ArrowLeft, CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react';
import { useStore } from '../store/usageStore';
import type { AuthStatus, Settings } from '../types';

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

const INTERVALS = [
  { label: '30 秒', value: 30 },
  { label: '1 分钟',  value: 60 },
  { label: '2 分钟',  value: 120 },
  { label: '5 分钟',  value: 300 },
];

export default function SettingsPanel({ onClose, embedded = false }: Props) {
  const { loadSettings, saveSettings, getAuthStatus, refresh } = useStore();
  const [cfg, setCfg] = useState<Settings>({
    refresh_interval_secs: 60,
    autostart: false,
    notify_at_90_pct: true,
  });
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshAuthStatus = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);

      // The banner is driven by the global usage snapshot, not this panel's
      // local auth status. Refresh that snapshot as part of rechecking auth so
      // a successful login clears a stale COOKIE_EXPIRED/NO_AUTH error.
      await refresh();
    } finally {
      setCheckingAuth(false);
    }
  }, [getAuthStatus, refresh]);

  useEffect(() => {
    loadSettings().then(setCfg);
    void refreshAuthStatus();
  }, [loadSettings, refreshAuthStatus]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveSettings(cfg);
      await refreshAuthStatus();
      onClose?.();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const authOk = authStatus?.source === 'codex';

  return (
    <div className={`settings-panel${embedded ? ' settings-panel--embedded' : ''}`}>
      {/* Header */}
      {!embedded && (
        <div className="settings-header">
          <Button className="icon-btn" variant="ghost" size="icon-sm" onClick={onClose} aria-label="返回">
            <ArrowLeft size={14} />
          </Button>
          <span className="settings-title">设置</span>
          <div style={{ width: 28 }} />
        </div>
      )}

      <div className="settings-body">
        {/* Auth section */}
        <div className="settings-section">
          <div className="settings-section-label">登录态</div>
          <div className={`auth-status ${authOk ? 'auth-status--ok' : 'auth-status--fail'}`}>
            <div className="auth-status-main">
              {checkingAuth ? (
                <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : authOk ? (
                <CheckCircle size={13} />
              ) : (
                <XCircle size={13} />
              )}
              <span>{authStatus?.message ?? '正在检测 Codex 登录态'}</span>
            </div>
            {authStatus?.auth_path && (
              <div className="auth-status-path">{authStatus.auth_path}</div>
            )}
          </div>
          <Button
            className="test-btn"
            variant="outline"
            size="sm"
            onClick={refreshAuthStatus}
            disabled={checkingAuth}
          >
            <RefreshCw size={12} style={{ animation: checkingAuth ? 'spin 0.8s linear infinite' : 'none' }} />
            重新检测
          </Button>
          <div className="settings-hint">
            程序会在启动和刷新时自动读取 Codex CLI token。未登录时，在终端运行 codex login 后点重新检测。
          </div>
        </div>

        {/* Refresh interval */}
        <div className="settings-section">
          <div className="settings-section-label">刷新间隔</div>
          <ToggleGroup
            className="seg-ctrl"
            aria-label="刷新间隔"
            value={[String(cfg.refresh_interval_secs)]}
            onValueChange={(values) => {
              const next = Number(values[0]);
              if (Number.isFinite(next)) {
                setCfg((current) => ({ ...current, refresh_interval_secs: next }));
              }
            }}
          >
            {INTERVALS.map(({ label, value }) => (
              <Toggle
                key={value}
                value={String(value)}
                className={`seg-btn ${cfg.refresh_interval_secs === value ? 'seg-btn--active' : ''}`}
              >
                {label}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>

        {/* Toggle rows */}
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">开机自启</div>
              <div className="settings-row-sub">发布版可随登录自动启动</div>
            </div>
            <Switch
              size="md"
              checked={cfg.autostart}
              onCheckedChange={v => setCfg(c => ({ ...c, autostart: v }))}
              aria-label="开机自启"
            />
          </div>
          <div className="settings-row" style={{ marginTop: 10 }}>
            <div>
              <div className="settings-row-label">用量提醒</div>
              <div className="settings-row-sub">任一有效额度窗口达到 90% 时通知</div>
            </div>
            <Switch
              size="md"
              checked={cfg.notify_at_90_pct}
              onCheckedChange={v => setCfg(c => ({ ...c, notify_at_90_pct: v }))}
              aria-label="用量提醒"
            />
          </div>
        </div>

        {/* Version */}
        <div style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center', padding: '4px 0' }}>
          codex-ui v0.1.0
        </div>

        {saveError && (
          <div className="settings-error" role="alert">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="settings-footer">
        {!embedded && <Button className="btn-secondary" variant="outline" onClick={onClose}>取消</Button>}
        <Button className="btn-save" variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  );
}
