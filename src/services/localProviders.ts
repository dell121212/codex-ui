/**
 * Multi-company local token capture.
 *
 * Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 * Grok:  ~/.grok/sessions/.../updates.jsonl + summary.json / signals.json
 * Others: path probes so chips light up once data appears.
 */

import type {
  AgentId,
  ModelUsage,
  PeriodUsage,
  ProviderLocalUsage,
  ProviderRemoteQuota,
  WindowUsage,
} from '../types';
import {
  addModelUsage,
  buildPeriodUsage,
  clamp,
  enrichWithCosts,
  mergeModelMap,
  parseJson,
  parseRolloutFile,
  type ModelTokenMap,
} from './usageLogic';

export const EMPTY_PERIOD: PeriodUsage = { messages: 0, tokens: 0, models: [] };

const EMPTY_REMOTE_WINDOW: WindowUsage = {
  used: 0,
  limit: 0,
  percent: 0,
  window_duration_mins: 0,
  reset_at_unix: 0,
  remaining_secs: 0,
};

type FileApi = {
  readFile: (path: string) => Promise<string>;
  readDirectory: (path: string) => Promise<Array<{ entry: string; type: string }>>;
  getStats?: (path: string) => Promise<{ modifiedAt: number; size: number }>;
};

export interface LocalProviderProbe {
  id: AgentId;
  /** Relative to home */
  roots: string[];
  authFiles?: string[];
}

/** Companies we auto-scan. Order matches COMPANY_LIST preference. */
export const LOCAL_PROVIDER_PROBES: LocalProviderProbe[] = [
  {
    id: 'codex',
    roots: ['.codex'],
    authFiles: ['.codex/auth.json'],
  },
  {
    id: 'claude',
    roots: ['.claude', '.config/claude', '.config/claude-code'],
    authFiles: ['.claude/.credentials.json', '.config/claude-code/.credentials.json'],
  },
  {
    id: 'kimi',
    roots: ['.kimi', '.moonshot', '.config/kimi'],
    authFiles: ['.kimi/auth.json', '.moonshot/auth.json'],
  },
  {
    id: 'grok',
    roots: ['.grok'],
    authFiles: ['.grok/auth.json'],
  },
  {
    id: 'mistral',
    roots: ['.vibe'],
    authFiles: ['.vibe/.env'],
  },
  {
    id: 'glm',
    roots: ['.glm', '.zhipu', '.codegeex', '.config/glm'],
    authFiles: ['.glm/auth.json', '.zhipu/auth.json'],
  },
];

function emptyProvider(id: AgentId, available = false, authOk?: boolean): ProviderLocalUsage {
  return {
    provider: id,
    available,
    hasTokens: false,
    authOk,
    today: { ...EMPTY_PERIOD },
    month: { ...EMPTY_PERIOD },
  };
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function inMonth(d: Date, monthStart: Date): boolean {
  return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
}

async function pathExists(api: FileApi, path: string): Promise<boolean> {
  try {
    await api.readDirectory(path);
    return true;
  } catch {
    try {
      await api.readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** Recursively list files under dir whose name matches predicate (depth-limited). */
async function walkFiles(
  api: FileApi,
  dir: string,
  match: (name: string) => boolean,
  depth = 0,
  maxDepth = 6,
): Promise<string[]> {
  if (depth > maxDepth) return [];
  let entries: Array<{ entry: string; type: string }>;
  try {
    entries = await api.readDirectory(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const ent of entries) {
    const full = `${dir}/${ent.entry}`;
    if (ent.type === 'DIRECTORY') {
      out.push(...await walkFiles(api, full, match, depth + 1, maxDepth));
    } else if (ent.type === 'FILE' && match(ent.entry)) {
      out.push(full);
    }
  }
  return out;
}

// ─── Codex ───────────────────────────────────────────────────────────────────

export async function captureCodexLocal(
  api: FileApi,
  home: string,
  now = new Date(),
): Promise<ProviderLocalUsage> {
  const root = `${home}/.codex`;
  const available = await pathExists(api, root);
  if (!available) return emptyProvider('codex', false);

  let authOk: boolean | undefined;
  try {
    const raw = await api.readFile(`${home}/.codex/auth.json`);
    const parsed = JSON.parse(raw) as { tokens?: { access_token?: string }; access_token?: string };
    const token = parsed?.tokens?.access_token ?? parsed?.access_token;
    authOk = typeof token === 'string' && token.length > 0;
  } catch {
    authOk = false;
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthMap: ModelTokenMap = new Map();
  const todayMap: ModelTokenMap = new Map();
  let monthMessages = 0;
  let monthTokens = 0;
  let todayMessages = 0;
  let todayTokens = 0;

  for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    const y = String(day.getFullYear()).padStart(4, '0');
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    const dir = `${home}/.codex/sessions/${y}/${m}/${dd}`;
    let entries: Array<{ entry: string; type: string }> = [];
    try {
      entries = await api.readDirectory(dir);
    } catch {
      continue;
    }
    const isToday = isSameDay(day, now);
    for (const ent of entries) {
      if (ent.type !== 'FILE' || !ent.entry.startsWith('rollout-') || !ent.entry.endsWith('.jsonl')) {
        continue;
      }
      try {
        const parsed = parseRolloutFile(await api.readFile(`${dir}/${ent.entry}`));
        monthMessages += parsed.messages;
        monthTokens += parsed.tokens;
        mergeModelMap(monthMap, parsed.modelMap);
        if (isToday) {
          todayMessages += parsed.messages;
          todayTokens += parsed.tokens;
          mergeModelMap(todayMap, parsed.modelMap);
        }
      } catch {
        // ignore unreadable session
      }
    }
  }

  const today = enrichWithCosts(buildPeriodUsage(todayMessages, todayTokens, todayMap));
  const month = enrichWithCosts(buildPeriodUsage(monthMessages, monthTokens, monthMap));
  return {
    provider: 'codex',
    available: true,
    hasTokens: month.tokens > 0 || today.tokens > 0,
    authOk,
    authPath: `${home}/.codex/auth.json`,
    today,
    month,
  };
}

// ─── Grok ────────────────────────────────────────────────────────────────────

/**
 * Scan Grok session updates.jsonl for activity timestamps / prompt counts.
 *
 * IMPORTANT: `_meta.totalTokens` is a **context-window cursor**, not billed API
 * tokens. Official consumption comes from cli-chat-proxy `/v1/billing` only.
 * This parser therefore returns tokens=0 and only uses the stream for activity.
 */
export function parseGrokUpdatesFile(content: string): {
  tokens: number;
  messages: number;
  modelMap: ModelTokenMap;
  lastTsMs: number;
} {
  const promptIds = new Set<string>();
  let lastTsMs = 0;

  for (const line of content.split('\n')) {
    const entry = parseJson(line);
    if (!entry) continue;
    const rec = entry as Record<string, unknown>;
    const params = (rec.params && typeof rec.params === 'object')
      ? rec.params as Record<string, unknown>
      : {};
    const meta = (params._meta && typeof params._meta === 'object')
      ? params._meta as Record<string, unknown>
      : {};
    const update = (params.update && typeof params.update === 'object')
      ? params.update as Record<string, unknown>
      : {};
    const updateMeta = (update._meta && typeof update._meta === 'object')
      ? update._meta as Record<string, unknown>
      : {};

    const ts = Number(meta.agentTimestampMs ?? rec.timestamp ?? 0);
    if (Number.isFinite(ts) && ts > lastTsMs) lastTsMs = ts;

    const promptId = meta.promptId ?? updateMeta.promptId ?? meta.turnStartMs;
    if (promptId != null && String(promptId)) {
      promptIds.add(String(promptId));
    }
  }

  return {
    tokens: 0, // never invent billed usage from context cursor
    messages: promptIds.size,
    modelMap: new Map(),
    lastTsMs,
  };
}

export function parseGrokSummary(raw: string): {
  model: string;
  createdAt?: Date;
  updatedAt?: Date;
  messages?: number;
} {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const model = String(data.current_model_id ?? data.currentModelId ?? 'grok');
    const createdAt = data.created_at ? new Date(String(data.created_at)) : undefined;
    const updatedAt = data.updated_at || data.last_active_at
      ? new Date(String(data.updated_at ?? data.last_active_at))
      : undefined;
    const messages = Math.max(
      0,
      Math.floor(Number(data.num_chat_messages ?? data.num_messages ?? 0)),
    );
    return {
      model: model || 'grok',
      createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : undefined,
      updatedAt: updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt : undefined,
      messages: messages > 0 ? messages : undefined,
    };
  } catch {
    return { model: 'grok' };
  }
}

export function parseGrokSignals(raw: string): {
  /** Context-window size only — not billed API tokens. */
  contextTokens?: number;
  models?: string[];
  turns?: number;
} {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const contextTokens = Number(data.contextTokensUsed ?? data.context_tokens_used);
    const turns = Number(data.turnCount ?? data.userMessageCount ?? 0);
    const models = Array.isArray(data.modelsUsed)
      ? data.modelsUsed.map(String)
      : data.primaryModelId
        ? [String(data.primaryModelId)]
        : undefined;
    return {
      contextTokens: Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : undefined,
      models,
      turns: Number.isFinite(turns) && turns > 0 ? turns : undefined,
    };
  } catch {
    return {};
  }
}

export async function captureGrokLocal(
  api: FileApi,
  home: string,
  now = new Date(),
): Promise<ProviderLocalUsage> {
  const root = `${home}/.grok`;
  const available = await pathExists(api, root);
  if (!available) return emptyProvider('grok', false);

  let authOk: boolean | undefined;
  try {
    const raw = await api.readFile(`${home}/.grok/auth.json`);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    authOk = parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
  } catch {
    authOk = false;
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let monthMessages = 0;
  let todayMessages = 0;
  let lastActiveAt: string | undefined;

  // Fast path: summary.json only (skip multi-MB updates.jsonl — not billed usage).
  const summaries = await walkFiles(api, `${root}/sessions`, (n) => n === 'summary.json');
  for (const summaryPath of summaries) {
    let sessionDate = now;
    let messages = 0;
    try {
      const summary = parseGrokSummary(await api.readFile(summaryPath));
      sessionDate = summary.updatedAt ?? summary.createdAt ?? now;
      messages = summary.messages ?? 1;
      if (summary.updatedAt) {
        const iso = summary.updatedAt.toISOString();
        if (!lastActiveAt || iso > lastActiveAt) lastActiveAt = iso;
      }
    } catch {
      continue;
    }

    const inThisMonth = inMonth(sessionDate, monthStart);
    const today = isSameDay(sessionDate, now);
    if (!inThisMonth && !today) continue;

    if (inThisMonth) monthMessages += messages;
    if (today) todayMessages += messages;
  }

  // tokens stay 0 — official Grok quota is remote billing only.
  const todayPeriod = enrichWithCosts(buildPeriodUsage(todayMessages, 0, new Map()));
  const monthPeriod = enrichWithCosts(buildPeriodUsage(monthMessages, 0, new Map()));

  return {
    provider: 'grok',
    available: true,
    // Local sessions only prove activity; real quota attaches after billing enrich.
    hasTokens: monthMessages > 0 || todayMessages > 0,
    authOk,
    authPath: `${home}/.grok/auth.json`,
    lastActiveAt,
    today: todayPeriod,
    month: monthPeriod,
  };
}

// ─── Mistral Vibe ────────────────────────────────────────────────────────────

/**
 * Parse one Vibe session meta.json.
 * Stats: session_prompt_tokens / session_completion_tokens / session_cost.
 */
export function parseVibeSessionMeta(raw: string): {
  model: string;
  input: number;
  output: number;
  tokens: number;
  contextTokens: number;
  cost?: number;
  start?: Date;
  end?: Date;
  messages: number;
} | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const stats = (data.stats && typeof data.stats === 'object')
      ? data.stats as Record<string, unknown>
      : {};
    const config = (data.config && typeof data.config === 'object')
      ? data.config as Record<string, unknown>
      : {};
    const input = Math.max(0, Math.floor(Number(stats.session_prompt_tokens ?? 0)));
    const output = Math.max(0, Math.floor(Number(stats.session_completion_tokens ?? 0)));
    const total = Math.max(
      0,
      Math.floor(Number(stats.session_total_llm_tokens ?? input + output)),
    );
    const contextTokens = Math.max(
      0,
      Math.floor(Number(stats.context_tokens ?? stats.last_turn_total_tokens ?? 0)),
    );
    if (input + output + total + contextTokens <= 0) return null;

    const model = String(config.active_model ?? data.model ?? 'mistral-vibe').trim() || 'mistral-vibe';
    const start = data.start_time ? new Date(String(data.start_time)) : undefined;
    const end = data.end_time ? new Date(String(data.end_time)) : undefined;
    const cost = Number(stats.session_cost);
    const messages = Math.max(1, Math.floor(Number(data.total_messages ?? 1)));

    return {
      model,
      input: input || Math.max(0, total - output),
      output,
      tokens: total || input + output,
      contextTokens,
      cost: Number.isFinite(cost) && cost > 0 ? cost : undefined,
      start: start && Number.isFinite(start.getTime()) ? start : undefined,
      end: end && Number.isFinite(end.getTime()) ? end : undefined,
      messages,
    };
  } catch {
    return null;
  }
}

/** Read Vibe auto_compact_threshold (legacy CLI context bar — not account quota). */
export function parseVibeContextThreshold(configToml: string): number {
  const match = configToml.match(/^\s*auto_compact_threshold\s*=\s*(\d+)/m);
  const n = match ? Number(match[1]) : 200_000;
  return Number.isFinite(n) && n > 0 ? n : 200_000;
}

/** active_model from ~/.vibe/config.toml */
export function parseVibeActiveModel(configToml: string): string {
  const match = configToml.match(/^\s*active_model\s*=\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/m);
  const model = match?.[1]?.trim() ?? '';
  return model || 'mistral-small-latest';
}

/** Strip quotes from .env values: KEY='abc' / KEY="abc". */
export function parseEnvValue(line: string): string {
  const idx = line.indexOf('=');
  if (idx < 0) return '';
  return line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
}

export function extractMistralApiKey(envFile: string): string | null {
  for (const line of envFile.split('\n')) {
    if (/^\s*MISTRAL_API_KEY\s*=/i.test(line)) {
      const v = parseEnvValue(line);
      return v || null;
    }
  }
  return null;
}

/** Official Mistral chat rate-limit response headers (Free tier exposes month on some pools). */
export interface MistralRateLimits {
  monthLimit: number | null;
  monthRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
  queryCost: number | null;
}

export function parseMistralRateLimitHeaders(headerBlock: string): MistralRateLimits {
  const get = (...names: string[]): number | null => {
    for (const name of names) {
      const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(\\d+)`, 'im');
      const m = headerBlock.match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  return {
    monthLimit: get('x-ratelimit-limit-tokens-month'),
    monthRemaining: get('x-ratelimit-remaining-tokens-month'),
    minuteLimit: get(
      'x-ratelimit-limit-tokens-minute',
      'x-ratelimit-limit-tokens-5-minute',
    ),
    minuteRemaining: get(
      'x-ratelimit-remaining-tokens-minute',
      'x-ratelimit-remaining-tokens-5-minute',
    ),
    queryCost: get('x-ratelimit-tokens-query-cost'),
  };
}

/**
 * Account token quota for Mistral Free / API.
 *
 * Primary = monthly tokens (official rate-limit month headers when present;
 * otherwise local calendar-month burn with limit=0 so UI can show "本月已用").
 * Secondary = tokens/minute when headers present.
 */
export function buildMistralTokenQuota(opts: {
  localMonthTokens: number;
  limits?: MistralRateLimits | null;
  planLabel?: string;
  model?: string;
}): ProviderRemoteQuota {
  const limits = opts.limits ?? null;
  const localUsed = Math.max(0, Math.floor(opts.localMonthTokens));

  let monthLimit = 0;
  let monthUsed = localUsed;
  if (limits?.monthLimit != null && limits.monthLimit > 0) {
    monthLimit = limits.monthLimit;
    if (limits.monthRemaining != null && Number.isFinite(limits.monthRemaining)) {
      monthUsed = Math.max(0, monthLimit - limits.monthRemaining);
    }
  }

  const primary: WindowUsage = {
    used: monthUsed,
    limit: monthLimit,
    percent: monthLimit > 0 ? clamp((monthUsed / monthLimit) * 100, 0, 100) : 0,
    window_duration_mins: 43_200,
    reset_at_unix: 0,
    remaining_secs: 0,
  };

  let secondary = { ...EMPTY_REMOTE_WINDOW };
  const products: Array<{ product: string; percent: number }> = [];
  if (limits?.minuteLimit != null && limits.minuteLimit > 0) {
    const rem = limits.minuteRemaining ?? limits.minuteLimit;
    const usedMin = Math.max(0, limits.minuteLimit - rem);
    const pct = clamp((usedMin / limits.minuteLimit) * 100, 0, 100);
    secondary = {
      used: usedMin,
      limit: limits.minuteLimit,
      percent: pct,
      window_duration_mins: 1,
      reset_at_unix: 0,
      remaining_secs: 0,
    };
    products.push({ product: '分钟 Token', percent: pct });
  }
  if (monthLimit > 0) {
    products.unshift({ product: '月 Token', percent: primary.percent });
  }

  const hasMonth = monthLimit > 0;
  const hasMinute = secondary.limit > 0;
  let source = 'local-month';
  if (hasMonth && hasMinute) source = 'api-ratelimit';
  else if (hasMonth) source = 'api-ratelimit-month';
  else if (hasMinute) source = 'api-ratelimit-minute+local-month';

  return {
    source,
    primary,
    secondary,
    products,
    monthly: hasMonth ? { used: monthUsed, limit: monthLimit } : undefined,
    plan_label: opts.planLabel,
    primary_label: '月 Token',
    fetched_at: new Date().toISOString(),
  };
}

/** @deprecated context window is not account quota — kept for tests/compat. */
export function buildVibeContextQuota(
  contextTokens: number,
  threshold: number,
  planLabel?: string,
): ProviderRemoteQuota {
  // Redirect to token-shaped quota so callers never surface "上下文额度".
  return buildMistralTokenQuota({
    localMonthTokens: contextTokens,
    limits: threshold > 0
      ? {
          monthLimit: threshold,
          monthRemaining: Math.max(0, threshold - contextTokens),
          minuteLimit: null,
          minuteRemaining: null,
          queryCost: null,
        }
      : null,
    planLabel,
  });
}

/** Parse /api/vibe/whoami plan fields. */
export function parseVibeWhoAmI(raw: unknown): { plan_label: string; plan_type: string } | null {
  const data = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const planType = typeof data.plan_type === 'string' ? data.plan_type.trim() : '';
  const planName = typeof data.plan_name === 'string' ? data.plan_name.trim() : '';
  if (!planType && !planName) return null;

  const type = planType.toUpperCase();
  let plan_label = planName || planType;
  if (type === 'CHAT') plan_label = planName ? `订阅 · ${planName}` : '订阅 Pro';
  else if (type === 'API' && /free/i.test(planName)) plan_label = 'API Free';
  else if (type === 'API') plan_label = planName ? `API · ${planName}` : 'API Scale';
  else if (type === 'MISTRAL_CODE') plan_label = planName ? `Code · ${planName}` : 'Mistral Code';

  return { plan_label, plan_type: type || 'UNKNOWN' };
}

/** Parse Admin spend-limit / rate-limit payloads when Admin API key works. */
export function parseMistralAdminLimits(
  spendJson: unknown,
  rateJson: unknown,
  base?: ProviderRemoteQuota,
): ProviderRemoteQuota {
  const spend = spendJson !== null && typeof spendJson === 'object'
    ? spendJson as Record<string, unknown>
    : {};
  const rate = rateJson !== null && typeof rateJson === 'object'
    ? rateJson as Record<string, unknown>
    : {};

  const amount = Number(spend.amount ?? spend.monthly_limit ?? spend.limit);
  const used = Number(spend.used ?? spend.current_spend ?? spend.spent);
  const noLimit = spend.no_monthly_limit === true;

  let monthly: ProviderRemoteQuota['monthly'] = base?.monthly;
  let primary = base?.primary ?? { ...EMPTY_REMOTE_WINDOW };
  let secondary = base?.secondary ?? { ...EMPTY_REMOTE_WINDOW };

  // Admin spend is $ — only promote to primary when we have no token month limit.
  if (!noLimit && Number.isFinite(amount) && amount > 0) {
    const u = Number.isFinite(used) && used >= 0 ? used : 0;
    monthly = { used: u, limit: amount };
    // Keep token month as primary if already set from rate-limit headers.
    if (!(primary.limit > 0 && base?.primary_label === '月 Token')) {
      primary = {
        used: u,
        limit: amount,
        percent: clamp((u / amount) * 100, 0, 100),
        window_duration_mins: 43_200,
        reset_at_unix: 0,
        remaining_secs: 0,
      };
    } else {
      secondary = {
        used: u,
        limit: amount,
        percent: clamp((u / amount) * 100, 0, 100),
        window_duration_mins: 43_200,
        reset_at_unix: 0,
        remaining_secs: 0,
      };
    }
  }

  const products = [...(base?.products ?? [])];
  const models = Array.isArray(rate.models) ? rate.models
    : Array.isArray(rate.rate_limits) ? rate.rate_limits
      : [];
  for (const item of models.slice(0, 4)) {
    const row = item !== null && typeof item === 'object' ? item as Record<string, unknown> : {};
    const name = String(row.model ?? row.name ?? row.id ?? '').trim();
    const tpm = Number(row.tpm ?? row.tokens_per_minute ?? row.limit);
    const usedTpm = Number(row.used ?? row.usage ?? 0);
    if (!name || !Number.isFinite(tpm) || tpm <= 0) continue;
    products.push({
      product: name,
      percent: clamp((Math.max(0, usedTpm) / tpm) * 100, 0, 100),
    });
  }

  return {
    source: base?.source?.includes('admin') ? base.source : `${base?.source ?? 'api'}+admin`,
    primary,
    secondary,
    products,
    monthly: monthly ?? base?.monthly,
    plan_label: base?.plan_label,
    primary_label: primary.limit > 0 ? (base?.primary_label ?? '月 Token') : (base?.primary_label ?? '月 Token'),
    fetched_at: new Date().toISOString(),
  };
}

export async function captureMistralVibeLocal(
  api: FileApi,
  home: string,
  now = new Date(),
): Promise<ProviderLocalUsage> {
  const root = `${home}/.vibe`;
  const available = await pathExists(api, root);
  if (!available) return emptyProvider('mistral', false);

  let authOk = false;
  let apiKey: string | null = null;
  try {
    const env = await api.readFile(`${home}/.vibe/.env`);
    apiKey = extractMistralApiKey(env);
    authOk = !!apiKey;
  } catch {
    authOk = false;
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthMap: ModelTokenMap = new Map();
  const todayMap: ModelTokenMap = new Map();
  let monthMessages = 0;
  let monthTokens = 0;
  let todayMessages = 0;
  let todayTokens = 0;
  let lastActiveAt: string | undefined;
  // Prefer Vibe's own session_cost when present (more accurate than re-pricing).
  let monthCost = 0;
  let todayCost = 0;

  const metas = await walkFiles(api, `${root}/logs/session`, (n) => n === 'meta.json', 0, 4);
  for (const metaPath of metas) {
    let parsed: ReturnType<typeof parseVibeSessionMeta>;
    try {
      parsed = parseVibeSessionMeta(await api.readFile(metaPath));
    } catch {
      continue;
    }
    if (!parsed) continue;

    const when = parsed.end ?? parsed.start ?? now;
    if (parsed.end) {
      const iso = parsed.end.toISOString();
      if (!lastActiveAt || iso > lastActiveAt) lastActiveAt = iso;
    }

    // Calendar month only — free-tier quota is monthly, not rolling 90d / context window.
    const inThisMonth = inMonth(when, monthStart);
    const isToday = isSameDay(when, now);
    if (!inThisMonth && !isToday) continue;

    const modelMap: ModelTokenMap = new Map();
    addModelUsage(modelMap, parsed.model, parsed.input, 0, parsed.output);

    if (inThisMonth) {
      monthMessages += parsed.messages;
      monthTokens += parsed.tokens;
      mergeModelMap(monthMap, modelMap);
      if (parsed.cost != null) monthCost += parsed.cost;
    }
    if (isToday) {
      todayMessages += parsed.messages;
      todayTokens += parsed.tokens;
      mergeModelMap(todayMap, modelMap);
      if (parsed.cost != null) todayCost += parsed.cost;
    }
  }

  let todayPeriod = enrichWithCosts(buildPeriodUsage(todayMessages, todayTokens, todayMap));
  let monthPeriod = enrichWithCosts(buildPeriodUsage(monthMessages, monthTokens, monthMap));

  // If Vibe reported session_cost, prefer that for the single-model aggregate.
  if (monthCost > 0 && monthPeriod.models.length === 1) {
    monthPeriod = {
      ...monthPeriod,
      models: [{ ...monthPeriod.models[0], cost_usd: round4(monthCost) }],
    };
  }
  if (todayCost > 0 && todayPeriod.models.length === 1) {
    todayPeriod = {
      ...todayPeriod,
      models: [{ ...todayPeriod.models[0], cost_usd: round4(todayCost) }],
    };
  }

  // Local month tokens until remote enrich fills official free-tier month headers.
  const remote = buildMistralTokenQuota({
    localMonthTokens: monthPeriod.tokens,
    planLabel: 'API Free',
  });

  return {
    provider: 'mistral',
    available: true,
    hasTokens: monthPeriod.tokens > 0 || todayPeriod.tokens > 0,
    authOk,
    authPath: `${home}/.vibe/.env`,
    lastActiveAt,
    today: todayPeriod,
    month: monthPeriod,
    remote,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// ─── Generic probe (Claude / Kimi / GLM …) ───────────────────────────────────

/**
 * Lightweight scan: if the company root exists, mark available.
 * When session JSONL with token-like fields appear later, parsers can be added
 * without changing the company list UI.
 */
export async function captureGenericLocal(
  api: FileApi,
  home: string,
  probe: LocalProviderProbe,
): Promise<ProviderLocalUsage> {
  let available = false;
  for (const rel of probe.roots) {
    if (await pathExists(api, `${home}/${rel}`)) {
      available = true;
      break;
    }
  }
  if (!available) return emptyProvider(probe.id, false);

  let authOk: boolean | undefined;
  if (probe.authFiles) {
    authOk = false;
    for (const rel of probe.authFiles) {
      if (await pathExists(api, `${home}/${rel}`)) {
        authOk = true;
        break;
      }
    }
  }

  // Best-effort: look for any *.jsonl under roots and try common token shapes.
  const monthMap: ModelTokenMap = new Map();
  const todayMap: ModelTokenMap = new Map();
  let monthMessages = 0;
  let monthTokens = 0;
  let todayMessages = 0;
  let todayTokens = 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const rel of probe.roots) {
    const root = `${home}/${rel}`;
    if (!(await pathExists(api, root))) continue;
    const files = await walkFiles(api, root, (n) => n.endsWith('.jsonl'), 0, 5);
    for (const file of files.slice(0, 40)) {
      try {
        // Reuse Codex rollout parser — works for similar token_count shapes.
        const parsed = parseRolloutFile(await api.readFile(file));
        if (parsed.tokens <= 0) continue;
        // Without reliable mtime API in all environments, attribute to month.
        // If Neutralino getStats available, refine day bucket.
        let when = now;
        if (api.getStats) {
          try {
            const st = await api.getStats(file);
            if (st.modifiedAt > 1e12) when = new Date(st.modifiedAt);
            else if (st.modifiedAt > 0) when = new Date(st.modifiedAt * 1000);
          } catch {
            // keep now
          }
        }
        if (inMonth(when, monthStart)) {
          monthMessages += parsed.messages;
          monthTokens += parsed.tokens;
          mergeModelMap(monthMap, parsed.modelMap);
        }
        if (isSameDay(when, now)) {
          todayMessages += parsed.messages;
          todayTokens += parsed.tokens;
          mergeModelMap(todayMap, parsed.modelMap);
        }
      } catch {
        // ignore
      }
    }
  }

  const today = enrichWithCosts(buildPeriodUsage(todayMessages, todayTokens, todayMap));
  const month = enrichWithCosts(buildPeriodUsage(monthMessages, monthTokens, monthMap));
  return {
    provider: probe.id,
    available: true,
    hasTokens: month.tokens > 0 || today.tokens > 0,
    authOk,
    today,
    month,
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Official Grok CLI billing (cli-chat-proxy.grok.com) — NOT local context windows.
 *
 * - GET /v1/billing?format=credits → weekly creditUsagePercent + productUsage (Build/Chat)
 * - GET /v1/billing               → monthly included used / monthlyLimit (credit units)
 *
 * Local session totalTokens / contextTokensUsed are context-window sizes and must
 * never be treated as billed API consumption.
 */
export function parseGrokBillingResponses(
  creditsJson: unknown,
  monthlyJson: unknown,
  nowUnix = Math.floor(Date.now() / 1000),
): ProviderRemoteQuota {
  const creditsRoot = asRecord(creditsJson);
  const credits = asRecord(creditsRoot.config ?? creditsRoot);
  const monthlyRoot = asRecord(monthlyJson);
  const monthly = asRecord(monthlyRoot.config ?? monthlyRoot);

  const weekPercent = Number(credits.creditUsagePercent ?? 0);
  const period = asRecord(credits.currentPeriod ?? credits.current_period);
  const weekEnd = parseIsoUnix(
    String(period.end ?? credits.billingPeriodEnd ?? credits.billing_period_end ?? ''),
  );
  const weekStart = parseIsoUnix(
    String(period.start ?? credits.billingPeriodStart ?? credits.billing_period_start ?? ''),
  );
  const weekMins = weekStart && weekEnd && weekEnd > weekStart
    ? Math.max(1, Math.round((weekEnd - weekStart) / 60))
    : 10_080;

  // Primary = official weekly credit pool (% of included weekly budget).
  const primary: WindowUsage = {
    used: Math.round(clamp(weekPercent, 0, 100)),
    limit: 100,
    percent: clamp(weekPercent, 0, 100),
    window_duration_mins: weekMins,
    reset_at_unix: weekEnd ?? 0,
    remaining_secs: Math.max(0, (weekEnd ?? 0) - nowUnix),
  };

  const productsRaw = Array.isArray(credits.productUsage)
    ? credits.productUsage
    : Array.isArray(credits.product_usage)
      ? credits.product_usage
      : [];
  const products = productsRaw.map((item) => {
    const row = asRecord(item);
    return {
      product: String(row.product ?? 'unknown'),
      percent: clamp(Number(row.usagePercent ?? row.usage_percent ?? 0), 0, 100),
    };
  });

  const monthLimit = Number(asRecord(monthly.monthlyLimit).val ?? monthly.monthlyLimit ?? 0);
  const monthUsed = Number(asRecord(monthly.used).val ?? monthly.used ?? 0);
  const monthStart = String(monthly.billingPeriodStart ?? monthly.billing_period_start ?? '');
  const monthEnd = String(monthly.billingPeriodEnd ?? monthly.billing_period_end ?? '');
  const hasMonth = Number.isFinite(monthLimit) && monthLimit > 0 && Number.isFinite(monthUsed);
  const monthPct = hasMonth ? clamp((Math.max(0, monthUsed) / monthLimit) * 100, 0, 100) : 0;

  // Secondary = official monthly included usage (credit units from /v1/billing).
  // Prefer this over product % so "额度消耗" is real billed usage, not context size.
  const secondary: WindowUsage = hasMonth
    ? {
        used: Math.max(0, monthUsed),
        limit: Math.max(0, monthLimit),
        percent: monthPct,
        window_duration_mins: 43_200,
        reset_at_unix: parseIsoUnix(monthEnd) ?? 0,
        remaining_secs: Math.max(0, (parseIsoUnix(monthEnd) ?? 0) - nowUnix),
      }
    : (() => {
        const build = products.find((p) => /build/i.test(p.product)) ?? products[0];
        return build
          ? {
              used: Math.round(build.percent),
              limit: 100,
              percent: build.percent,
              window_duration_mins: weekMins,
              reset_at_unix: weekEnd ?? 0,
              remaining_secs: Math.max(0, (weekEnd ?? 0) - nowUnix),
            }
          : { ...EMPTY_REMOTE_WINDOW };
      })();

  return {
    source: 'grok-billing',
    primary,
    secondary,
    products,
    monthly: hasMonth
      ? {
          used: Math.max(0, monthUsed),
          limit: Math.max(0, monthLimit),
          period_start: monthStart || undefined,
          period_end: monthEnd || undefined,
        }
      : undefined,
    plan_label: 'Grok Build',
    primary_label: '周额度',
    fetched_at: new Date(nowUnix * 1000).toISOString(),
  };
}

/** Extract OIDC access token from ~/.grok/auth.json shape. */
export function loadGrokAccessToken(authJson: unknown): {
  token: string;
  expiresAt?: string;
  email?: string;
} | null {
  if (!authJson || typeof authJson !== 'object') return null;
  const root = authJson as Record<string, unknown>;
  for (const value of Object.values(root)) {
    const entry = asRecord(value);
    const token = entry.key ?? entry.access_token ?? entry.accessToken;
    if (typeof token === 'string' && token.trim()) {
      return {
        token: token.trim(),
        expiresAt: typeof entry.expires_at === 'string' ? entry.expires_at : undefined,
        email: typeof entry.email === 'string' ? entry.email : undefined,
      };
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseIsoUnix(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export async function captureAllLocalProviders(
  api: FileApi,
  home: string,
  now = new Date(),
): Promise<ProviderLocalUsage[]> {
  const results: ProviderLocalUsage[] = [];

  for (const probe of LOCAL_PROVIDER_PROBES) {
    try {
      if (probe.id === 'codex') {
        results.push(await captureCodexLocal(api, home, now));
      } else if (probe.id === 'grok') {
        results.push(await captureGrokLocal(api, home, now));
      } else if (probe.id === 'mistral') {
        results.push(await captureMistralVibeLocal(api, home, now));
      } else {
        results.push(await captureGenericLocal(api, home, probe));
      }
    } catch {
      results.push(emptyProvider(probe.id, false));
    }
  }

  return results;
}

export function providerUsageMap(
  list: ProviderLocalUsage[],
): Partial<Record<AgentId, ProviderLocalUsage>> {
  const map: Partial<Record<AgentId, ProviderLocalUsage>> = {};
  for (const item of list) map[item.provider] = item;
  return map;
}

/** Merge models across providers for an "all companies" view. */
export function mergeProviderModels(list: ProviderLocalUsage[], which: 'today' | 'month'): ModelUsage[] {
  const map: ModelTokenMap = new Map();
  let messages = 0;
  let tokens = 0;
  for (const p of list) {
    const period = which === 'today' ? p.today : p.month;
    messages += period.messages;
    tokens += period.tokens;
    for (const m of period.models) {
      // Prefix model with provider so Grok/Codex names don't collide in UI.
      const label = p.provider === 'codex' ? m.model : `${p.provider}/${m.model}`;
      addModelUsage(map, label, m.input_tokens, m.cached_input_tokens, m.output_tokens);
    }
  }
  return enrichWithCosts(buildPeriodUsage(messages, tokens, map)).models;
}
