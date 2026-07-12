interface Props {
  errorKind?: string | null;
  error?: string | null;
  onOpenSettings: () => void;
}

type BannerCfg = {
  bg: string;
  border: string;
  color: string;
  clickable: boolean;
  msg: string;
};

const BANNERS: Record<string, BannerCfg> = {
  NO_AUTH: {
    bg: 'rgba(10,132,255,.10)',
    border: 'rgba(10,132,255,.25)',
    color: '#0a84ff',
    clickable: true,
    msg: '未检测到 Codex 登录态。请在终端运行 codex login，程序会自动读取 token',
  },
  COOKIE_EXPIRED: {
    bg: 'rgba(255,159,10,.10)',
    border: 'rgba(255,159,10,.30)',
    color: '#ff9f0a',
    clickable: true,
    msg: 'Codex access token 已被服务端拒绝。请重新运行 codex login，程序会自动读取新 token',
  },
  NETWORK_ERROR: {
    bg: 'rgba(255,69,58,.10)',
    border: 'rgba(255,69,58,.25)',
    color: '#ff453a',
    clickable: false,
    msg: '✗ 额度接口暂时不可用（网络 / 防火墙），本地会话与 token 读取仍可用',
  },
  PARSE_ERROR: {
    bg: 'rgba(255,69,58,.10)',
    border: 'rgba(255,69,58,.25)',
    color: '#ff453a',
    clickable: false,
    msg: '✗ API 响应格式已变化，请到 GitHub 反馈',
  },
};

export default function SetupBanner({ errorKind, error, onOpenSettings }: Props) {
  if (!errorKind) return null;
  const cfg = BANNERS[errorKind];
  if (!cfg) return null;

  return (
    <div
      className="setup-banner"
      style={{
        background: cfg.bg,
        border: `0.5px solid ${cfg.border}`,
        color: cfg.color,
        cursor: cfg.clickable ? 'pointer' : 'default',
      }}
      onClick={cfg.clickable ? onOpenSettings : undefined}
      role={cfg.clickable ? 'button' : undefined}
      tabIndex={cfg.clickable ? 0 : undefined}
      onKeyDown={cfg.clickable ? (e) => e.key === 'Enter' && onOpenSettings() : undefined}
    >
      <div>{cfg.msg}</div>
      {error && <div className="setup-banner-detail">{error}</div>}
    </div>
  );
}
