export interface WindowUsage {
  used: number;
  limit: number;
  percent: number;
  window_duration_mins: number;
  reset_at_unix: number;
  remaining_secs: number;
}

export interface RateLimitBucket {
  id: string;
  name: string | null;
  primary: WindowUsage;
  secondary: WindowUsage;
  plan_type: string | null;
}

export interface ModelUsage {
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  percent_of_total: number;
}

export interface PeriodUsage {
  messages: number;
  tokens: number;
  models: ModelUsage[];
}

export interface BankedResets {
  available: number | null;
  credits: ResetCredit[];
  lifetime_used: number;
  last_reset_at: string | null;
}

export interface ResetCredit {
  id: string;
  status: string;
  title: string | null;
  description: string | null;
  granted_at: number;
  expires_at: number | null;
}

export type ResetOutcome = 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed' | 'failed';

export interface SpendInfo {
  month_total_usd: number;
  avg_daily_usd: number;
  projected_usd: number;
  unpriced_models: string[];
  pricing_as_of: string;
}

/** Coding agents / companies supported for local capture + board. */
export type AgentId =
  | 'codex'
  | 'claude'
  | 'gemini'
  | 'kimi'
  | 'cursor'
  | 'copilot'
  | 'opencode'
  | 'grok'
  | 'minimax'
  | 'glm'
  | 'mistral'
  | 'windsurf'
  | 'other';

/** Remote subscription / credit window for a company (e.g. Grok weekly credits). */
export interface ProviderRemoteQuota {
  source: string;
  /** Primary ring — weekly credits (Grok) or monthly tokens (Mistral Free). */
  primary: WindowUsage;
  /** Secondary — product split or minute TPM for Mistral. */
  secondary: WindowUsage;
  products: Array<{ product: string; percent: number }>;
  monthly?: {
    used: number;
    limit: number;
    period_start?: string;
    period_end?: string;
  };
  /** Human plan label when known (Vibe Free / Pro / API Scale …). */
  plan_label?: string;
  /** Primary metric caption override (e.g. 月 Token). */
  primary_label?: string;
  fetched_at: string;
  error?: string;
}

/** Per-company local session token capture (Codex / Grok / …). */
export interface ProviderLocalUsage {
  provider: AgentId;
  /** Local data directory found */
  available: boolean;
  /** At least one session with tokens this month/today */
  hasTokens: boolean;
  authOk?: boolean;
  authPath?: string;
  lastActiveAt?: string;
  today: PeriodUsage;
  month: PeriodUsage;
  /** Official remote quota when the company exposes an API (Grok billing). */
  remote?: ProviderRemoteQuota;
}

export interface UsageSnapshot {
  fetched_at: string;
  provider: string;
  window_5h: WindowUsage;
  window_weekly: WindowUsage;
  rate_limits: RateLimitBucket[];
  /** Codex local usage (backward compatible). */
  today_local: PeriodUsage;
  month_local: PeriodUsage;
  /** Multi-company local capture. */
  local_providers: ProviderLocalUsage[];
  banked_resets: BankedResets;
  spend: SpendInfo;
  error?: string;
  /** "NO_AUTH" | "COOKIE_EXPIRED" | "NETWORK_ERROR" | "PARSE_ERROR" */
  error_kind?: string;
}

export interface Settings {
  refresh_interval_secs: number;
  autostart: boolean;
  notify_at_90_pct: boolean;
}

export interface AuthStatus {
  source: 'codex' | 'none';
  account_id?: string;
  auth_path?: string;
  message: string;
}

// ─── Multi-agent Kanban board ────────────────────────────────────────────────
// Column model: Backlog → In Progress → Review → Done

export type BoardColumnId = 'backlog' | 'in_progress' | 'review' | 'done';
export type BoardPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  columnId: BoardColumnId;
  priority: BoardPriority;
  /** Coding agent / provider assigned to this task */
  agentType: AgentId;
  /** Optional repo / workspace path for the task */
  repoPath?: string;
  /** Optional branch name */
  branchName?: string;
  /** Soft stop / success condition (maps to Codex /goal or peer prompts) */
  successCheck?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  archived?: boolean;
  order: number;
}

export interface BoardColumnMeta {
  id: BoardColumnId;
  title: string;
  hint: string;
  color: string;
}

export type AppView = 'usage' | 'board';
