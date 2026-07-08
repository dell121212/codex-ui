import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Eye, EyeOff, CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react';
import { useStore } from '../store/usageStore';
import type { AuthStatus, Settings } from '../types';

interface Props {
  onClose: () => void;
}

const INTERVALS = [
  { label: '30 秒', value: 30 },
  { label: '1 分钟',  value: 60 },
  { label: '2 分钟',  value: 120 },
  { label: '5 分钟',  value: 300 },
];

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" aria-label="开关">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

export default function SettingsPanel({ onClose }: Props) {
  const { loadSettings, saveSettings, testConnection, getAuthStatus } = useStore();
  const [cfg, setCfg] = useState<Settings>({
    chatgpt_cookie: '',
    refresh_interval_secs: 60,
    autostart: false,
    notify_at_90_pct: true,
  });
  const [showCookie, setShowCookie] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshAuthStatus = useCallback(async () => {
    setCheckingAuth(true);
    try {
      setAuthStatus(await getAuthStatus());
    } finally {
      setCheckingAuth(false);
    }
  }, [getAuthStatus]);

  useEffect(() => {
    loadSettings().then(s =>
      setCfg({ ...s, chatgpt_cookie: s.chatgpt_cookie ?? '' })
    );
    void refreshAuthStatus();
  }, [loadSettings, refreshAuthStatus]);

  const handleTest = useCallback(async () => {
    if (!cfg.chatgpt_cookie) return;
    setTestState('testing');
    const ok = await testConnection(cfg.chatgpt_cookie);
    setTestState(ok ? 'ok' : 'fail');
    setTimeout(() => setTestState('idle'), 4000);
  }, [cfg.chatgpt_cookie, testConnection]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveSettings({
        ...cfg,
        chatgpt_cookie: cfg.chatgpt_cookie || undefined,
      });
      await refreshAuthStatus();
      onClose();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const testIcon = {
    idle:    null,
    testing: <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />,
    ok:      <CheckCircle size={12} color="#30d158" />,
    fail:    <XCircle size={12} color="#ff453a" />,
  }[testState];

  const testLabel = { idle: '测试连接', testing: '测试中…', ok: '已连接 ✓', fail: '连接失败 ✗' }[testState];
  const authOk = authStatus?.source === 'codex';
  const authWarn = authStatus?.source === 'cookie';

  return (
    <div className="settings-panel">
      {/* Header */}
      <div className="settings-header">
        <button className="icon-btn" onClick={onClose} aria-label="返回">
          <ArrowLeft size={14} />
        </button>
        <span className="settings-title">设置</span>
        <div style={{ width: 28 }} />
      </div>

      <div className="settings-body">
        {/* Auth section */}
        <div className="settings-section">
          <div className="settings-section-label">登录态</div>
          <div className={`auth-status ${authOk ? 'auth-status--ok' : authWarn ? 'auth-status--warn' : 'auth-status--fail'}`}>
            <div className="auth-status-main">
              {checkingAuth ? (
                <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : authOk ? (
                <CheckCircle size={13} />
              ) : authWarn ? (
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
          <button
            className="test-btn"
            onClick={refreshAuthStatus}
            disabled={checkingAuth}
          >
            <RefreshCw size={12} style={{ animation: checkingAuth ? 'spin 0.8s linear infinite' : 'none' }} />
            重新检测
          </button>
          <div className="settings-hint">
            程序会在启动和刷新时自动读取 Codex CLI token。未登录时，在终端运行 codex login 后点重新检测。
          </div>
        </div>

        {/* Cookie section */}
        <div className="settings-section">
          <div className="settings-section-label">备用 Cookie</div>
          <div className="settings-hint">
            仅当 Codex 登录态不可用时使用；正常情况下这里可以留空。
          </div>
          <div className="settings-cookie-row">
            <textarea
              className="settings-textarea"
              value={cfg.chatgpt_cookie ?? ''}
              onChange={e => setCfg(c => ({ ...c, chatgpt_cookie: e.target.value }))}
              placeholder="备用：粘贴 __Secure-next-auth.session-token…"
              rows={3}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 10 }}
              data-type={showCookie ? 'text' : 'password'}
            />
            <button
              className="icon-btn"
              onClick={() => setShowCookie(v => !v)}
              aria-label={showCookie ? '隐藏 Cookie' : '显示 Cookie'}
              style={{ alignSelf: 'flex-start', marginTop: 2 }}
            >
              {showCookie ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            className="test-btn"
            onClick={handleTest}
            disabled={!cfg.chatgpt_cookie || testState === 'testing'}
          >
            {testIcon && <span className="test-icon">{testIcon}</span>}
            {testLabel}
          </button>
          <div className="settings-hint">
            Cookie 获取方式：chatgpt.com → F12 → Application → Cookies
          </div>
        </div>

        {/* Refresh interval */}
        <div className="settings-section">
          <div className="settings-section-label">刷新间隔</div>
          <div className="seg-ctrl" role="group" aria-label="刷新间隔">
            {INTERVALS.map(({ label, value }) => (
              <button
                key={value}
                className={`seg-btn ${cfg.refresh_interval_secs === value ? 'seg-btn--active' : ''}`}
                onClick={() => setCfg(c => ({ ...c, refresh_interval_secs: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle rows */}
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">开机自启</div>
              <div className="settings-row-sub">登录后静默启动并驻留系统托盘</div>
            </div>
            <Toggle
              value={cfg.autostart}
              onChange={v => setCfg(c => ({ ...c, autostart: v }))}
            />
          </div>
          <div className="settings-row" style={{ marginTop: 10 }}>
            <div>
              <div className="settings-row-label">用量提醒</div>
              <div className="settings-row-sub">5 小时窗口达到 90% 时通知</div>
            </div>
            <Toggle
              value={cfg.notify_at_90_pct}
              onChange={v => setCfg(c => ({ ...c, notify_at_90_pct: v }))}
            />
          </div>
        </div>

        {/* Version */}
        <div style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center', padding: '4px 0' }}>
          codex-bar-lite v0.1.0
        </div>

        {saveError && (
          <div className="settings-error" role="alert">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="settings-footer">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
