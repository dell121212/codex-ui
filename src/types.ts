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
  cache_creation_tokens?: number;
  output_tokens: number;
  cost_usd: number | null;
  percent_of_total: number;
}

export interface PeriodUsage {
  messages: number;
  tokens: number;
  models: ModelUsage[];
}

/** One deduplicated, timestamped model-usage record from a local provider. */
export interface UsageEvent {
  timestamp_unix: number;
  timestamp_unix_ms?: number;
  timestamp?: string;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_id?: string;
  project_path?: string;
  parent_session_id?: string;
  cache_creation_tokens?: number;
  reasoning_output_tokens?: number;
  service_tier?: 'standard' | 'fast' | null;
  cost_usd?: number | null;
}

export type UsagePeriodKey = 'current' | 'month' | 'total';

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
  /** Parser used to create the provider's local usage records. */
  usage_engine?: 'ccusage-rust' | 'typescript-compatibility';
  usage_engine_error?: string;
  /** Raw, de-duplicated records used for precise range and session analysis. */
  events?: UsageEvent[];
  /** Inclusive UTC coverage bounds for the loaded event slice. */
  events_range_from_unix?: number;
  events_range_to_unix?: number;
  daily_usage?: Array<{ day: string; tokens: number }>;
  local_rate_limits?: { primary: WindowUsage; secondary: WindowUsage };
  authOk?: boolean;
  authPath?: string;
  lastActiveAt?: string;
  today: PeriodUsage;
  /** Local token usage attributed to the Provider's active quota window. */
  current: PeriodUsage;
  /** Local token usage in the quota window immediately preceding `current`. */
  previous?: PeriodUsage;
  /** Local token usage after the user-owned local subtotal checkpoint. */
  subtotal?: PeriodUsage;
  month: PeriodUsage;
  /** All locally recorded usage available to this app. */
  total: PeriodUsage;
  /** Stable start boundary for the active local quota period. */
  current_period_start?: number;
  /** Stable identity for deciding whether a current-period counter may regress. */
  current_period_end?: number;
  /** Stable identity derived from the active local quota window boundaries. */
  current_period_key?: string;
  /** Start boundary for the local quota period immediately preceding `current`. */
  previous_period_start?: number;
  /** End boundary for the local quota period immediately preceding `current`. */
  previous_period_end?: number;
  /** Stable identity for the previous local quota period. */
  previous_period_key?: string;
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
  current_local: PeriodUsage;
  previous_local?: PeriodUsage;
  subtotal_local?: PeriodUsage;
  month_local: PeriodUsage;
  total_local: PeriodUsage;
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
  start_hidden: boolean;
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
