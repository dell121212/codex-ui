import { describe, expect, it } from 'vitest';
import {
  buildAgentPrompt,
  buildCodexGoalPrompt,
  createTask,
  filterTasks,
  moveTask,
  normalizeTasks,
  nextOrderForColumn,
  tasksByColumn,
} from './boardLogic';
import { isValidAgentId } from './agentCatalog';

describe('boardLogic', () => {
  it('creates a backlog task with defaults', () => {
    const task = createTask({ title: '  Ship kanban  ', description: ' add board ' });
    expect(task.title).toBe('Ship kanban');
    expect(task.description).toBe('add board');
    expect(task.columnId).toBe('backlog');
    expect(task.priority).toBe('medium');
    expect(task.id).toBeTruthy();
  });

  it('moves a task across columns and stamps timestamps', () => {
    const a = createTask({ title: 'A', columnId: 'backlog', order: 0 });
    const b = createTask({ title: 'B', columnId: 'backlog', order: 1 });
    let tasks = [a, b];

    tasks = moveTask(tasks, a.id, 'in_progress');
    const moved = tasks.find((t) => t.id === a.id)!;
    expect(moved.columnId).toBe('in_progress');
    expect(moved.startedAt).toBeTypeOf('number');
    expect(tasksByColumn(tasks, 'backlog')).toHaveLength(1);
    expect(tasksByColumn(tasks, 'in_progress')).toHaveLength(1);

    tasks = moveTask(tasks, a.id, 'done');
    const done = tasks.find((t) => t.id === a.id)!;
    expect(done.columnId).toBe('done');
    expect(done.completedAt).toBeTypeOf('number');
  });

  it('inserts at a specific index within the destination column', () => {
    const t1 = createTask({ title: '1', columnId: 'review', order: 0 });
    const t2 = createTask({ title: '2', columnId: 'review', order: 1 });
    const t3 = createTask({ title: '3', columnId: 'backlog', order: 0 });
    const tasks = moveTask([t1, t2, t3], t3.id, 'review', 1);
    const review = tasksByColumn(tasks, 'review');
    expect(review.map((t) => t.title)).toEqual(['1', '3', '2']);
    expect(review.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('computes next order for a column', () => {
    const tasks = [
      createTask({ title: 'a', columnId: 'backlog', order: 0 }),
      createTask({ title: 'b', columnId: 'backlog', order: 3 }),
      createTask({ title: 'c', columnId: 'done', order: 9 }),
    ];
    expect(nextOrderForColumn(tasks, 'backlog')).toBe(4);
    expect(nextOrderForColumn(tasks, 'in_progress')).toBe(0);
  });

  it('builds a Codex /goal prompt', () => {
    const task = createTask({
      title: 'Fix auth race',
      description: 'Race on token refresh',
      successCheck: 'npm test && npm run typecheck pass',
      repoPath: '/home/me/app',
      branchName: 'fix/auth-race',
      agentType: 'codex',
    });
    const prompt = buildCodexGoalPrompt(task);
    expect(prompt).toContain('/goal Fix auth race');
    expect(prompt).toContain('Race on token refresh');
    expect(prompt).toContain('完成条件：npm test && npm run typecheck pass');
    expect(prompt).toContain('工作目录：/home/me/app');
    expect(prompt).toContain('分支：fix/auth-race');
  });

  it('builds agent-specific prompts for Claude, Kimi and Grok', () => {
    const claude = createTask({ title: 'Refactor parser', agentType: 'claude' });
    const kimi = createTask({ title: '写单元测试', agentType: 'kimi' });
    const grok = createTask({ title: 'Fix flaky test', agentType: 'grok' });
    const claudePrompt = buildAgentPrompt(claude);
    const kimiPrompt = buildAgentPrompt(kimi);
    const grokPrompt = buildAgentPrompt(grok);
    expect(claudePrompt).toContain('# Refactor parser');
    expect(claudePrompt).toContain('Claude Code');
    expect(claudePrompt).not.toContain('/goal');
    expect(kimiPrompt).toContain('Kimi');
    expect(grokPrompt).toContain('Grok / xAI');
    expect(grokPrompt).toContain('Grok');
    expect(isValidAgentId('glm')).toBe(true);
    expect(isValidAgentId('grok')).toBe(true);
    expect(isValidAgentId('nope')).toBe(false);
  });

  it('filters by agent type', () => {
    const tasks = [
      createTask({ title: 'a', agentType: 'codex' }),
      createTask({ title: 'b', agentType: 'claude' }),
      createTask({ title: 'c', agentType: 'kimi' }),
    ];
    expect(filterTasks(tasks, '', 'all', 'claude')).toHaveLength(1);
    expect(filterTasks(tasks, 'kimi', 'all', 'all')[0].agentType).toBe('kimi');
  });

  it('normalizes and filters tasks', () => {
    const raw = [
      { id: '1', title: 'OK', columnId: 'backlog', priority: 'high', agentType: 'claude', createdAt: 1, updatedAt: 1, order: 0 },
      { id: '1', title: 'dup id', columnId: 'done', createdAt: 2, updatedAt: 2, order: 0 },
      { id: '2', title: 'bad column', columnId: 'nope' },
      { title: 'missing id', columnId: 'done' },
      { id: '3', title: 'nan order', columnId: 'review', order: Number.NaN, createdAt: 1, updatedAt: 1 },
      null,
    ];
    const tasks = normalizeTasks(raw);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].agentType).toBe('claude');
    expect(tasks[1].agentType).toBe('codex'); // default
    expect(tasks[1].order).toBe(0);

    const filtered = filterTasks(
      [
        ...tasks,
        createTask({ title: 'Other', description: 'kanban widget', priority: 'low' }),
      ],
      'kanban',
      'low',
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Other');
  });

  it('rejects invalid column on create', () => {
    const task = createTask({ title: 'x', columnId: 'nope' as 'backlog' });
    expect(task.columnId).toBe('backlog');
  });
});
