/**
 * Multi-agent catalog + company strip for the usage page.
 * Tasks can be assigned to any engine; prompt export adapts per agent.
 */

import type { AgentId } from '../types';

export type { AgentId };

export interface AgentMeta {
  id: AgentId;
  /** Short label for chips / filters */
  label: string;
  /** Longer display name */
  fullName: string;
  /** Company / vendor display name (OpenAI, Anthropic, …) */
  company: string;
  /** Accent color (CSS) */
  color: string;
  /** Compact badge text */
  badge: string;
  /** Copy-button label */
  promptLabel: string;
  /** Whether usage tab can show real remote metrics today */
  usageBackend: 'codex' | 'local-hint' | 'none';
  /** Hint for local install / config path */
  localHint: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: 'codex',
    label: 'Codex',
    fullName: 'OpenAI Codex',
    company: 'OpenAI',
    color: '#0a84ff',
    badge: 'CX',
    promptLabel: '/goal',
    usageBackend: 'codex',
    localHint: '~/.codex',
  },
  {
    id: 'claude',
    label: 'Claude',
    fullName: 'Claude Code',
    company: 'Anthropic',
    color: '#d97706',
    badge: 'CL',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: '~/.claude',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    fullName: 'Gemini CLI',
    company: 'Google',
    color: '#4285f4',
    badge: 'GM',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: '~/.gemini',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    fullName: 'Kimi / Moonshot',
    company: '月之暗面',
    color: '#a855f7',
    badge: 'KM',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'Kimi CLI / kimi-auth',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    fullName: 'Cursor',
    company: 'Anysphere',
    color: '#22d3ee',
    badge: 'CR',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'Cursor app session',
  },
  {
    id: 'copilot',
    label: 'Copilot',
    fullName: 'GitHub Copilot',
    company: 'GitHub',
    color: '#94a3b8',
    badge: 'CP',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'gh / Copilot CLI',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    fullName: 'OpenCode',
    company: 'OpenCode',
    color: '#34d399',
    badge: 'OC',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'OpenCode workspace',
  },
  {
    id: 'grok',
    label: 'Grok',
    fullName: 'Grok / xAI',
    company: 'xAI',
    color: '#e8e8e8',
    badge: 'GK',
    promptLabel: 'prompt',
    // Remote weekly credits via cli-chat-proxy.grok.com/v1/billing + local sessions
    usageBackend: 'local-hint',
    localHint: '~/.grok',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    fullName: 'MiniMax',
    company: 'MiniMax',
    color: '#f472b6',
    badge: 'MM',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'MiniMax coding plan',
  },
  {
    id: 'glm',
    label: 'GLM',
    fullName: '智谱 GLM / CodeGeeX',
    company: '智谱',
    color: '#38bdf8',
    badge: 'GLM',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: '智谱 / GLM coding',
  },
  {
    id: 'mistral',
    label: 'Vibe',
    fullName: 'Mistral Vibe',
    company: 'Mistral',
    color: '#f97316',
    badge: 'MV',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: '~/.vibe',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    fullName: 'Windsurf',
    company: 'Codeium',
    color: '#2dd4bf',
    badge: 'WS',
    promptLabel: 'prompt',
    usageBackend: 'local-hint',
    localHint: 'Windsurf app',
  },
  {
    id: 'other',
    label: '其他',
    fullName: 'Other agent',
    company: '其他',
    color: 'rgba(255,255,255,0.45)',
    badge: '···',
    promptLabel: 'prompt',
    usageBackend: 'none',
    localHint: '自定义引擎',
  },
];

const AGENT_IDS = new Set<string>(AGENTS.map((a) => a.id));

/** Still valid in storage / prompts, but not shown in picker lists. */
export const HIDDEN_FROM_LIST: ReadonlySet<AgentId> = new Set<AgentId>(['gemini']);

/** Agents shown in UI pickers (chips, filters, dialogs). */
export const VISIBLE_AGENTS: AgentMeta[] = AGENTS.filter((a) => !HIDDEN_FROM_LIST.has(a.id));

export function isValidAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && AGENT_IDS.has(value);
}

export function agentMeta(id: AgentId | undefined | null): AgentMeta {
  if (id && isValidAgentId(id)) {
    return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
  }
  return AGENTS[0];
}

/**
 * Companies shown on the usage-page company strip.
 * OpenAI has live local token capture; others are catalog entries for now.
 */
export const COMPANY_LIST: AgentId[] = [
  'codex',    // OpenAI
  'claude',   // Anthropic
  'kimi',     // 月之暗面
  'grok',     // xAI
  'mistral',  // Mistral Vibe
  'glm',      // 智谱
];

/** @deprecated use COMPANY_LIST */
export const MODEL_LIST_ENGINES = COMPANY_LIST;

/** Engines shown on the usage-page provider strip (if enabled). */
export const USAGE_PROVIDER_TABS: AgentId[] = [...COMPANY_LIST];

export type AgentPromptPayload = {
  title: string;
  description?: string;
  successCheck?: string;
  repoPath?: string;
  branchName?: string;
  agentType?: AgentId;
};

/**
 * Build a paste-ready prompt tailored to the assigned agent.
 * Codex → `/goal`; others → natural-language task brief with success criteria.
 */
export function buildAgentPrompt(task: AgentPromptPayload): string {
  const agent = agentMeta(task.agentType);
  const body: string[] = [];

  if (agent.id === 'codex') {
    body.push(`/goal ${task.title}`, '');
  } else {
    body.push(`# ${task.title}`, '');
    body.push(`引擎：${agent.fullName}`, '');
  }

  if (task.description?.trim()) {
    body.push(task.description.trim(), '');
  }

  if (task.successCheck?.trim()) {
    body.push(`完成条件：${task.successCheck.trim()}`);
  } else {
    body.push('完成条件：实现需求并通过相关测试 / typecheck。');
  }

  if (task.repoPath?.trim()) body.push(`工作目录：${task.repoPath.trim()}`);
  if (task.branchName?.trim()) body.push(`分支：${task.branchName.trim()}`);

  // Agent-specific tips
  switch (agent.id) {
    case 'codex':
      body.push('', '约束：小步提交可验证的改动；不要扩大范围。');
      break;
    case 'claude':
      body.push('', '约束：优先最小 diff；改完后给出验证命令。使用 Claude Code 工具自主完成。');
      break;
    case 'gemini':
      body.push('', '约束：在 Gemini CLI 中完成；保持变更可审查、可回滚。');
      break;
    case 'kimi':
      body.push('', '约束：面向 Kimi / Moonshot 编程工作流；输出清晰的步骤与验证。');
      break;
    case 'grok':
      body.push('', '约束：在 Grok / xAI 工作流中完成；优先可运行补丁与明确验证步骤。');
      break;
    case 'cursor':
      body.push('', '约束：在 Cursor 中应用补丁；避免无关文件改动。');
      break;
    case 'copilot':
      body.push('', '约束：通过 GitHub Copilot / CLI 完成；保持 PR 可审。');
      break;
    case 'glm':
      body.push('', '约束：面向智谱 GLM 编码助手；中文说明 + 可运行验证。');
      break;
    case 'mistral':
      body.push('', '约束：在 Mistral Vibe CLI 中完成；保持小步可验证改动。');
      break;
    default:
      body.push('', '约束：小步可验证改动；完成后说明如何验证。');
  }

  return body.join('\n').trim() + '\n';
}
