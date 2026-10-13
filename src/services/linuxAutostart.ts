import { getHomePath } from './neutralinoPaths';

function desktopValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('自启动路径包含无效字符');
  return value.replace(/\\/g, '\\\\');
}

/** Exec has argument quoting followed by the Desktop Entry string escaping. */
export function desktopExecQuote(value: string): string {
  const quoted = value.replace(/([\\"`$])/g, '\\$1').replace(/%/g, '%%');
  return desktopValue(`"${quoted}"`);
}

export function buildAutostartEntry(executable: string): string {
  if (!executable.startsWith('/')) throw new Error('自启动需要绝对程序路径');
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=codex-ui',
    'Comment=Codex usage dashboard',
    `Exec=${desktopExecQuote(executable)} --background`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

export async function autostartPath(api: Pick<NeutralinoApi, 'os'>): Promise<string> {
  const configured = await api.os.getEnv('XDG_CONFIG_HOME');
  const configHome = configured.startsWith('/') ? configured : `${await getHomePath(api.os)}/.config`;
  return `${configHome.replace(/\/+$/, '')}/autostart/codex-ui.desktop`;
}

/** Snapshot only our entry so a storage failure can undo the OS-side change. */
export async function applyLinuxAutostart(
  api: NeutralinoApi,
  enabled: boolean,
  locateExecutable: () => Promise<string>,
): Promise<() => Promise<void>> {
  const path = await autostartPath(api);
  let previous: string | null = null;
  try {
    const stats = await api.filesystem.getStats(path);
    if (!stats.isFile) throw new Error('自启动文件路径被目录占用');
    previous = await api.filesystem.readFile(path);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'NE_FS_NOPATHE') throw error;
  }
  const restore = async () => {
    if (previous !== null) await api.filesystem.writeFile(path, previous);
    else if (enabled) {
      try {
        await api.filesystem.getStats(path);
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'NE_FS_NOPATHE') return;
        throw error;
      }
      await api.filesystem.remove(path);
    }
  };
  if (!enabled) {
    if (previous !== null) await api.filesystem.remove(path);
    return restore;
  }

  const executable = await locateExecutable();
  if (!executable.includes('/neutralino-dist/')) {
    throw new Error('请先运行 pnpm neutralino:build，并在发布版中开启开机自启。');
  }
  const entry = buildAutostartEntry(executable);
  const directory = path.slice(0, path.lastIndexOf('/'));
  try {
    await api.filesystem.createDirectory(directory);
  } catch (error) {
    // Existing directories return NE_FS_DIRCRER in the pinned runtime.
    if (!(await api.filesystem.getStats(directory)).isDirectory) throw error;
  }
  try {
    await api.filesystem.writeFile(path, entry);
  } catch (error) {
    try {
      await restore();
    } catch (rollbackError) {
      throw new Error(`自启动写入失败：${String(error)}；恢复失败：${String(rollbackError)}`);
    }
    throw error;
  }
  return restore;
}
