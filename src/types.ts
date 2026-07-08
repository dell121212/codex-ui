export interface WindowUsage {
  used: number;
  limit: number;
  percent: number;
  reset_at_unix: number;
  remaining_secs: number;
}

export interface ModelUsage {
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  percent_of_total: number;
}

export interface PeriodUsage {
  messages: number;
  tokens: number;
  models: ModelUsage[];
}

export interface BankedResets {
  available: number | null;
  lifetime_used: number;
  last_reset_at: string | null;
}

export interface SpendInfo {
  month_total_usd: number;
  avg_daily_usd: number;
  projected_usd: number;
}

export interface UsageSnapshot {
  fetched_at: string;
  provider: string;
  window_5h: WindowUsage;
  window_weekly: WindowUsage;
  today_local: PeriodUsage;
  month_local: PeriodUsage;
  banked_resets: BankedResets;
  spend: SpendInfo;
  error?: string;
  /** "NO_AUTH" | "COOKIE_EXPIRED" | "NETWORK_ERROR" | "PARSE_ERROR" */
  error_kind?: string;
}

export interface Settings {
  chatgpt_cookie?: string;
  refresh_interval_secs: number;
  autostart: boolean;
  notify_at_90_pct: boolean;
}

export interface AuthStatus {
  source: 'codex' | 'cookie' | 'none';
  account_id?: string;
  auth_path?: string;
  message: string;
}
