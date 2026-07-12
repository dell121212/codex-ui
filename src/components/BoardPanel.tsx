import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Plus, Search } from 'lucide-react';
import type { AgentId, BoardColumnId, BoardPriority } from '../types';
import { BOARD_COLUMNS, BOARD_PRIORITIES, countByAgent, countByColumn } from '../services/boardLogic';
import { VISIBLE_AGENTS } from '../services/agentCatalog';
import { useBoardStore } from '../store/boardStore';
import BoardColumn from './BoardColumn';
import BoardTaskDialog from './BoardTaskDialog';

export default function BoardPanel() {
  const load = useBoardStore((s) => s.load);
  const loaded = useBoardStore((s) => s.loaded);
  const query = useBoardStore((s) => s.query);
  const setQuery = useBoardStore((s) => s.setQuery);
  const priorityFilter = useBoardStore((s) => s.priorityFilter);
  const setPriorityFilter = useBoardStore((s) => s.setPriorityFilter);
  const agentFilter = useBoardStore((s) => s.agentFilter);
  const setAgentFilter = useBoardStore((s) => s.setAgentFilter);
  const showArchived = useBoardStore((s) => s.showArchived);
  const setShowArchived = useBoardStore((s) => s.setShowArchived);
  const restoreTask = useBoardStore((s) => s.restoreTask);
  const openCreate = useBoardStore((s) => s.openCreate);
  const toast = useBoardStore((s) => s.toast);
  const filteredTasks = useBoardStore((s) => s.filteredTasks);
  const allTasks = useBoardStore((s) => s.tasks);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardColumnId | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const tasks = filteredTasks();
  const counts = useMemo(() => countByColumn(allTasks), [allTasks]);
  const agentCounts = useMemo(() => countByAgent(allTasks), [allTasks]);
  const totalActive = Object.values(counts).reduce((a, b) => a + b, 0);
  const activeAgents = VISIBLE_AGENTS.filter((a) => (agentCounts[a.id] ?? 0) > 0);
  const archived = useMemo(
    () => allTasks.filter((t) => t.archived).sort((a, b) => b.updatedAt - a.updatedAt),
    [allTasks],
  );

  return (
    <div className="board-panel">
      <div className="board-toolbar">
        <div className="board-search">
          <Search size={12} aria-hidden className="board-search-icon" />
          <input
            className="board-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任务 / 引擎…"
            aria-label="搜索任务"
          />
        </div>

        <select
          className="board-filter"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value as AgentId | 'all')}
          aria-label="按引擎筛选"
        >
          <option value="all">全部引擎</option>
          {VISIBLE_AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
              {(agentCounts[a.id] ?? 0) > 0 ? ` (${agentCounts[a.id]})` : ''}
            </option>
          ))}
        </select>

        <select
          className="board-filter"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as BoardPriority | 'all')}
          aria-label="按优先级筛选"
        >
          <option value="all">全部优先级</option>
          {BOARD_PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>
          ))}
        </select>

        <button
          type="button"
          className={`board-filter-btn${showArchived ? ' board-filter-btn--on' : ''}`}
          onClick={() => setShowArchived(!showArchived)}
          title="查看已归档任务"
        >
          归档{archived.length > 0 ? ` ${archived.length}` : ''}
        </button>

        <button
          type="button"
          className="board-new-btn"
          onClick={() => openCreate('backlog')}
          title="新建任务 (N)"
        >
          <Plus size={13} />
          <span>新建</span>
        </button>
      </div>

      <div className="board-agent-chips" role="toolbar" aria-label="按引擎快速筛选">
        <button
          type="button"
          className={`board-agent-chip${agentFilter === 'all' ? ' board-agent-chip--active' : ''}`}
          onClick={() => setAgentFilter('all')}
        >
          全部
        </button>
        {VISIBLE_AGENTS.map((a) => {
          const n = agentCounts[a.id] ?? 0;
          return (
            <button
              key={a.id}
              type="button"
              className={`board-agent-chip${agentFilter === a.id ? ' board-agent-chip--active' : ''}`}
              style={{
                ['--chip-color' as string]: a.color,
              }}
              onClick={() => setAgentFilter(agentFilter === a.id ? 'all' : a.id)}
              title={a.fullName}
            >
              <i style={{ background: a.color }} />
              {a.label}
              {n > 0 && <span className="board-agent-chip-n">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="board-summary">
        <LayoutGrid size={12} aria-hidden />
        <span>
          {totalActive} 个任务
          {activeAgents.length > 0 && (
            <span className="board-summary-item">
              · {activeAgents.length} 种引擎
            </span>
          )}
          {BOARD_COLUMNS.map((c) => (
            <span key={c.id} className="board-summary-item">
              <i style={{ background: c.color }} />
              {c.title} {counts[c.id]}
            </span>
          ))}
        </span>
      </div>

      {showArchived && (
        <div className="board-archive-panel">
          <div className="board-archive-title">已归档（{archived.length}）</div>
          {archived.length === 0 ? (
            <p className="board-archive-empty">暂无归档任务</p>
          ) : (
            <ul className="board-archive-list">
              {archived.map((t) => (
                <li key={t.id} className="board-archive-item">
                  <span className="board-archive-name" title={t.title}>{t.title}</span>
                  <button
                    type="button"
                    className="board-mini-btn board-mini-btn--accent"
                    onClick={() => restoreTask(t.id)}
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loaded ? (
        <div className="empty-state">加载看板…</div>
      ) : totalActive === 0 && !query && priorityFilter === 'all' && agentFilter === 'all' ? (
        <div className="board-empty-hint board-empty-hint--static">
          <p>多引擎任务看板</p>
          <p className="board-empty-sub">
            一张板管 Codex、Claude、Kimi、Grok、Gemini、Cursor、GLM…
            卡片可指定引擎，并一键复制对应提示词（Codex 为 <code>/goal</code>）。
          </p>
          <button type="button" className="btn-primary" onClick={() => openCreate('backlog')}>
            <Plus size={13} />
            创建第一个任务
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="board-empty-hint board-empty-hint--static">
          <p>没有匹配的任务</p>
          <p className="board-empty-sub">试试清空搜索，或切换引擎 / 优先级筛选。</p>
        </div>
      ) : (
        <div className="board-scroller">
          {BOARD_COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              columnId={col.id}
              tasks={tasks}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTarget(null);
              }}
              dropTarget={dropTarget}
              onDropTarget={setDropTarget}
            />
          ))}
        </div>
      )}

      <BoardTaskDialog />

      {toast && (
        <div className="board-toast" role="status">{toast}</div>
      )}
    </div>
  );
}
