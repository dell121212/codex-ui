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
    start_hidden: true,
    notify_at_90_pct: true,
  });
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
    } catch (error) {
      setAuthStatus({ source: 'none', message: `登录态检测失败：${String(error)}` });
    } finally {
      setCheckingAuth(false);
    }
  }, [getAuthStatus, refresh]);

  useEffect(() => {
    let active = true;
    setLoadingSettings(true);
    setSettingsLoaded(false);
    loadSettings().then(settings => {
      if (!active) return;
      setCfg(settings);
      setSettingsLoaded(true);
    }).catch(error => {
      if (active) setSaveError(`设置加载失败：${String(error)}`);
    }).finally(() => {
      if (active) setLoadingSettings(false);
    });
    void refreshAuthStatus();
    return () => { active = false; };
  }, [loadSettings, refreshAuthStatus]);

  const handleSave = async () => {
    if (!settingsLoaded || loadingSettings || saving) return;
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
  const settingsDisabled = !settingsLoaded || loadingSettings || saving;

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
            自动读取 Codex CLI token；未登录时运行 codex login 后重新检测。
          </div>
        </div>

        {/* Refresh interval */}
        <div className="settings-section">
          <div className="settings-section-label">刷新间隔</div>
          <ToggleGroup
            className="seg-ctrl"
            aria-label="刷新间隔"
            disabled={settingsDisabled}
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
              <div className="settings-row-sub">登录桌面后静默启动到托盘</div>
            </div>
            <Switch
              size="md"
              checked={cfg.autostart}
              disabled={settingsDisabled}
              onCheckedChange={v => setCfg(c => ({ ...c, autostart: v }))}
              aria-label="开机自启"
            />
          </div>
          <div className="settings-row" style={{ marginTop: 10 }}>
            <div>
              <div className="settings-row-label">启动后静默运行</div>
              <div className="settings-row-sub">不弹出主窗口，从托盘打开；下次启动生效</div>
            </div>
            <Switch
              size="md"
              checked={cfg.start_hidden}
              disabled={settingsDisabled}
              onCheckedChange={v => setCfg(c => ({ ...c, start_hidden: v }))}
              aria-label="启动后静默运行"
            />
          </div>
          <div className="settings-hint">
            关闭窗口后仍在后台刷新；完全退出请使用托盘菜单的“退出”。
          </div>
          <div className="settings-row" style={{ marginTop: 10 }}>
            <div>
              <div className="settings-row-label">用量提醒</div>
              <div className="settings-row-sub">额度达 90% 时通知</div>
            </div>
            <Switch
              size="md"
              checked={cfg.notify_at_90_pct}
              disabled={settingsDisabled}
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
        <Button className="btn-save" variant="primary" onClick={handleSave} disabled={settingsDisabled}>
          {loadingSettings ? '加载设置中…' : saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  );
}
