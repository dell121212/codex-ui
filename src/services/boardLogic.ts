import type { AgentId, BoardColumnId, BoardColumnMeta, BoardPriority, BoardTask } from '../types';
import { agentMeta, buildAgentPrompt, isValidAgentId } from './agentCatalog';

export const BOARD_COLUMNS: BoardColumnMeta[] = [
  {
    id: 'backlog',
    title: '待办',
    hint: 'Backlog',
    color: 'var(--t3)',
  },
  {
    id: 'in_progress',
    title: '进行中',
    hint: 'In Progress',
    color: 'var(--blue)',
  },
  {
    id: 'review',
    title: '待审',
    hint: 'Review',
    color: 'var(--orange)',
  },
  {
    id: 'done',
    title: '完成',
    hint: 'Done',
    color: 'var(--green)',
  },
];

export const BOARD_PRIORITIES: { id: BoardPriority; label: string; emoji: string; color: string }[] = [
  { id: 'critical', label: '紧急', emoji: '🔴', color: 'var(--red)' },
  { id: 'high',     label: '高',   emoji: '🟠', color: 'var(--orange)' },
  { id: 'medium',   label: '中',   emoji: '🔵', color: 'var(--blue)' },
  { id: 'low',      label: '低',   emoji: '⚪', color: 'var(--t3)' },
];

const COLUMN_ORDER: BoardColumnId[] = ['backlog', 'in_progress', 'review', 'done'];

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_SUCCESS = 300;
const MAX_PATH = 260;
const MAX_BRANCH = 80;
const MAX_TASKS = 500;

export function createTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function priorityMeta(priority: BoardPriority) {
  return BOARD_PRIORITIES.find((p) => p.id === priority) ?? BOARD_PRIORITIES[2];
}

export function columnMeta(columnId: BoardColumnId) {
  return BOARD_COLUMNS.find((c) => c.id === columnId) ?? BOARD_COLUMNS[0];
}

/** Sort tasks within a column: order asc, then createdAt desc. */
export function sortTasksInColumn(tasks: BoardTask[]): BoardTask[] {
  return [...tasks].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return b.createdAt - a.createdAt;
  });
}

export function tasksByColumn(
  tasks: BoardTask[],
  columnId: BoardColumnId,
): BoardTask[] {
  return sortTasksInColumn(
    tasks.filter((t) => !t.archived && t.columnId === columnId),
  );
}

export function activeTasks(tasks: BoardTask[]): BoardTask[] {
  return tasks.filter((t) => !t.archived);
}

export function countByColumn(tasks: BoardTask[]): Record<BoardColumnId, number> {
  const counts: Record<BoardColumnId, number> = {
    backlog: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };
  for (const t of activeTasks(tasks)) {
    counts[t.columnId] += 1;
  }
  return counts;
}

/**
 * Reorder / move a task. When `toIndex` is omitted, appends to the end of the target column.
 * Returns a new task array (immutable).
 */
export function moveTask(
  tasks: BoardTask[],
  taskId: string,
  toColumn: BoardColumnId,
  toIndex?: number,
): BoardTask[] {
  if (!isValidColumnId(toColumn)) return tasks;
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.archived) return tasks;

  const now = Date.now();
  const others = tasks.filter((t) => t.id !== taskId);

  const dest = sortTasksInColumn(
    others.filter((t) => !t.archived && t.columnId === toColumn),
  );
  const insertAt = toIndex === undefined
    ? dest.length
    : Math.max(0, Math.min(toIndex, dest.length));

  const moved: BoardTask = {
    ...task,
    columnId: toColumn,
    updatedAt: now,
    startedAt: toColumn === 'in_progress' && !task.startedAt
      ? now
      : task.startedAt,
    completedAt: toColumn === 'done'
      ? (task.completedAt ?? now)
      : undefined,
  };

  dest.splice(insertAt, 0, moved);

  // Re-number order in destination column
  const destIds = new Set(dest.map((t) => t.id));
  const renumberedDest = dest.map((t, i) => ({ ...t, order: i }));

  // Keep other columns intact; replace dest tasks + keep archived / other columns
  const result: BoardTask[] = [];
  for (const t of others) {
    if (!t.archived && t.columnId === toColumn && destIds.has(t.id)) {
      continue; // will be re-added from renumberedDest
    }
    result.push(t);
  }
  result.push(...renumberedDest);

  return result;
}

export function nextOrderForColumn(tasks: BoardTask[], columnId: BoardColumnId): number {
  const col = tasks.filter((t) => !t.archived && t.columnId === columnId);
  if (col.length === 0) return 0;
  return Math.max(...col.map((t) => t.order)) + 1;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function createTask(input: {
  title: string;
  description?: string;
  priority?: BoardPriority;
  columnId?: BoardColumnId;
  agentType?: AgentId;
  repoPath?: string;
  branchName?: string;
  successCheck?: string;
  order?: number;
}): BoardTask {
  const now = Date.now();
  const columnId = isValidColumnId(input.columnId) ? input.columnId : 'backlog';
  const priority = isValidPriority(input.priority) ? input.priority : 'medium';
  const agentType = isValidAgentId(input.agentType) ? input.agentType : 'codex';
  return {
    id: createTaskId(),
    title: clip(input.title.trim(), MAX_TITLE),
    description: clip((input.description ?? '').trim(), MAX_DESCRIPTION),
    columnId,
    priority,
    agentType,
    repoPath: input.repoPath?.trim()
      ? clip(input.repoPath.trim(), MAX_PATH)
      : undefined,
    branchName: input.branchName?.trim()
      ? clip(input.branchName.trim(), MAX_BRANCH)
      : undefined,
    successCheck: input.successCheck?.trim()
      ? clip(input.successCheck.trim(), MAX_SUCCESS)
      : undefined,
    createdAt: now,
    updatedAt: now,
    order: Number.isFinite(input.order) ? Number(input.order) : 0,
  };
}

/** @deprecated use buildAgentPrompt — kept as alias for tests / call sites */
export function buildCodexGoalPrompt(task: BoardTask): string {
  return buildAgentPrompt(task);
}

export { buildAgentPrompt, agentMeta };

export function isValidColumnId(value: unknown): value is BoardColumnId {
  return typeof value === 'string' && COLUMN_ORDER.includes(value as BoardColumnId);
}

export function isValidPriority(value: unknown): value is BoardPriority {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low';
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Normalize persisted payload; drop corrupt entries; cap growth. */
export function normalizeTasks(raw: unknown): BoardTask[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const tasks: BoardTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id.trim()) continue;
    if (seen.has(r.id)) continue;
    if (typeof r.title !== 'string') continue;
    if (!isValidColumnId(r.columnId)) continue;

    const priority = isValidPriority(r.priority) ? r.priority : 'medium';
    const createdAt = finiteNumber(r.createdAt, Date.now());
    const updatedAt = finiteNumber(r.updatedAt, createdAt);
    const order = finiteNumber(r.order, 0);

    seen.add(r.id);
    tasks.push({
      id: r.id,
      title: clip(r.title, MAX_TITLE),
      description: typeof r.description === 'string'
        ? clip(r.description, MAX_DESCRIPTION)
        : '',
      columnId: r.columnId,
      priority,
      agentType: isValidAgentId(r.agentType) ? r.agentType : 'codex',
      repoPath: typeof r.repoPath === 'string' && r.repoPath.trim()
        ? clip(r.repoPath.trim(), MAX_PATH)
        : undefined,
      branchName: typeof r.branchName === 'string' && r.branchName.trim()
        ? clip(r.branchName.trim(), MAX_BRANCH)
        : undefined,
      successCheck: typeof r.successCheck === 'string' && r.successCheck.trim()
        ? clip(r.successCheck.trim(), MAX_SUCCESS)
        : undefined,
      createdAt,
      updatedAt,
      startedAt: typeof r.startedAt === 'number' && Number.isFinite(r.startedAt)
        ? r.startedAt
        : undefined,
      completedAt: typeof r.completedAt === 'number' && Number.isFinite(r.completedAt)
        ? r.completedAt
        : undefined,
      archived: !!r.archived,
      order,
    });

    if (tasks.length >= MAX_TASKS) break;
  }
  return tasks;
}

export function filterTasks(
  tasks: BoardTask[],
  query: string,
  priority?: BoardPriority | 'all',
  agent?: AgentId | 'all',
): BoardTask[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (t.archived) return false;
    if (priority && priority !== 'all' && t.priority !== priority) return false;
    if (agent && agent !== 'all' && t.agentType !== agent) return false;
    if (!q) return true;
    const meta = agentMeta(t.agentType);
    return (
      t.title.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || meta.label.toLowerCase().includes(q)
      || meta.fullName.toLowerCase().includes(q)
      || (t.repoPath?.toLowerCase().includes(q) ?? false)
      || (t.branchName?.toLowerCase().includes(q) ?? false)
    );
  });
}

export function countByAgent(tasks: BoardTask[]): Partial<Record<AgentId, number>> {
  const counts: Partial<Record<AgentId, number>> = {};
  for (const t of activeTasks(tasks)) {
    counts[t.agentType] = (counts[t.agentType] ?? 0) + 1;
  }
  return counts;
}
