import { useEffect, useState } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
import type { AgentId, BoardColumnId, BoardPriority, BoardTask } from '../types';
import { BOARD_COLUMNS, BOARD_PRIORITIES, isValidColumnId } from '../services/boardLogic';
import { VISIBLE_AGENTS, agentMeta } from '../services/agentCatalog';
import { useBoardStore } from '../store/boardStore';

export default function BoardTaskDialog() {
  const editingId = useBoardStore((s) => s.editingId);
  const tasks = useBoardStore((s) => s.tasks);
  const closeEditor = useBoardStore((s) => s.closeEditor);
  const addTask = useBoardStore((s) => s.addTask);
  const updateTask = useBoardStore((s) => s.updateTask);
  const archiveTask = useBoardStore((s) => s.archiveTask);
  const deleteTask = useBoardStore((s) => s.deleteTask);
  const agentFilter = useBoardStore((s) => s.agentFilter);

  const isCreate = !!editingId && editingId.startsWith('new:');
  const existing: BoardTask | undefined = !isCreate && editingId
    ? tasks.find((t) => t.id === editingId)
    : undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<BoardPriority>('medium');
  const [columnId, setColumnId] = useState<BoardColumnId>('backlog');
  const [agentType, setAgentType] = useState<AgentId>('codex');
  const [repoPath, setRepoPath] = useState('');
  const [branchName, setBranchName] = useState('');
  const [successCheck, setSuccessCheck] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    setConfirmDelete(false);
    if (editingId.startsWith('new:')) {
      const raw = editingId.slice(4);
      const col = isValidColumnId(raw) ? raw : 'backlog';
      const defaultAgent = agentFilter !== 'all' ? agentFilter : 'codex';
      setTitle('');
      setDescription('');
      setPriority('medium');
      setColumnId(col);
      setAgentType(defaultAgent);
      setRepoPath('');
      setBranchName('');
      setSuccessCheck('');
      setError(null);
      return;
    }
    const task = useBoardStore.getState().tasks.find((t) => t.id === editingId);
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setColumnId(task.columnId);
      setAgentType(task.agentType);
      setRepoPath(task.repoPath ?? '');
      setBranchName(task.branchName ?? '');
      setSuccessCheck(task.successCheck ?? '');
      setError(null);
    }
  }, [editingId, agentFilter]);

  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDelete) setConfirmDelete(false);
        else closeEditor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId, confirmDelete, closeEditor]);

  if (!editingId) return null;
  if (!isCreate && !existing) return null;

  const selectedAgent = agentMeta(agentType);

  const submit = async () => {
    if (!title.trim()) {
      setError('请填写任务标题');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isCreate) {
        await addTask({
          title,
          description,
          priority,
          columnId,
          agentType,
          repoPath,
          branchName,
          successCheck,
        });
      } else if (existing) {
        await updateTask(existing.id, {
          title,
          description,
          priority,
          columnId,
          agentType,
          repoPath,
          branchName,
          successCheck,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-backdrop board-dialog-backdrop" onClick={closeEditor}>
      <div
        className="board-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="board-dialog-header">
          <h2 id="board-dialog-title" className="board-dialog-title">
            {isCreate ? '新建任务' : '编辑任务'}
          </h2>
          <button type="button" className="icon-btn" onClick={closeEditor} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        <div className="board-dialog-body">
          <label className="board-field">
            <span className="board-field-label">标题</span>
            <input
              className="board-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：修复登录态竞态"
              autoFocus
              maxLength={120}
            />
          </label>

          <label className="board-field">
            <span className="board-field-label">描述</span>
            <textarea
              className="board-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="上下文、约束、相关文件…"
              rows={3}
              maxLength={2000}
            />
          </label>

          <label className="board-field">
            <span className="board-field-label">完成条件</span>
            <input
              className="board-input"
              value={successCheck}
              onChange={(e) => setSuccessCheck(e.target.value)}
              placeholder="npm test && npm run typecheck 通过"
              maxLength={300}
            />
          </label>

          <label className="board-field">
            <span className="board-field-label">执行引擎（Agent）</span>
            <select
              className="board-select"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentId)}
            >
              {/* Hidden agents (e.g. gemini) stay selectable only if already assigned. */}
              {!VISIBLE_AGENTS.some((a) => a.id === agentType) && (
                <option value={agentType}>
                  {selectedAgent.label} — {selectedAgent.fullName}
                </option>
              )}
              {VISIBLE_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.fullName}
                </option>
              ))}
            </select>
            <span className="board-field-hint">
              复制提示词将按 {selectedAgent.fullName} 格式导出
              {selectedAgent.id === 'codex' ? '（含 /goal）' : ''}
            </span>
          </label>

          <div className="board-field-row">
            <label className="board-field">
              <span className="board-field-label">优先级</span>
              <select
                className="board-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as BoardPriority)}
              >
                {BOARD_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>
                ))}
              </select>
            </label>

            <label className="board-field">
              <span className="board-field-label">列</span>
              <select
                className="board-select"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value as BoardColumnId)}
              >
                {BOARD_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="board-field-row">
            <label className="board-field">
              <span className="board-field-label">分支</span>
              <input
                className="board-input"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feat/…"
                maxLength={80}
              />
            </label>
            <label className="board-field">
              <span className="board-field-label">仓库路径</span>
              <input
                className="board-input"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="~/projects/app"
                maxLength={260}
              />
            </label>
          </div>

          {error && <div className="settings-error">{error}</div>}

          {confirmDelete && existing && (
            <div className="board-delete-confirm">
              <p>确定永久删除「{existing.title}」？此操作不可恢复。</p>
              <div className="board-delete-confirm-actions">
                <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn-confirm-danger"
                  onClick={() => deleteTask(existing.id)}
                >
                  确认删除
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="board-dialog-footer">
          {!isCreate && existing && !confirmDelete && (
            <div className="board-dialog-danger">
              <button
                type="button"
                className="board-mini-btn"
                onClick={() => archiveTask(existing.id)}
                title="归档（从看板隐藏）"
              >
                <Archive size={12} />
                归档
              </button>
              <button
                type="button"
                className="board-mini-btn board-mini-btn--danger"
                onClick={() => setConfirmDelete(true)}
                title="删除"
              >
                <Trash2 size={12} />
                删除
              </button>
            </div>
          )}
          <div className="board-dialog-actions">
            <button type="button" className="btn-secondary" onClick={closeEditor}>
              取消
            </button>
            <button
              type="button"
              className="btn-save"
              onClick={submit}
              disabled={busy || confirmDelete}
            >
              {isCreate ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
