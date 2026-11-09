import { constants } from 'node:fs';
import { access, mkdtemp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { desktopExecCommand, desktopValue } from '../src/services/linuxDesktopEntry.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Manage only this application's menu entry; autostart remains a setting. */
export async function installDesktopEntry({ root = projectRoot, env = process.env, ifPresent = false } = {}) {
  const dataHome = isAbsolute(env.XDG_DATA_HOME ?? '')
    ? env.XDG_DATA_HOME
    : join(env.HOME || homedir(), '.local/share');
  const applications = join(dataHome, 'applications');
  const path = join(applications, 'codex-ui.desktop');
  if (ifPresent) {
    try {
      await stat(path);
    } catch (error) {
      if (error.code === 'ENOENT') return { installed: false, path };
      throw error;
    }
  }

  const executable = join(resolve(root), 'neutralino-dist/codex-ui/bin/neutralino-linux_x64');
  const icon = join(resolve(root), 'public/icons/app.png');
  const entry = [
    '[Desktop Entry]', 'Type=Application', 'Name=codex-ui',
    'Comment=AI usage and quota workspace',
    `Exec=${desktopExecCommand(executable)} --show`,
    `Path=${desktopValue(dirname(executable))}`,
    `Icon=${desktopValue(icon)}`, 'Terminal=false', 'Categories=Utility;', '',
  ].join('\n');
  // Validate all build artifacts before replacing a previously working entry.
  await access(executable, constants.X_OK);
  await access(join(dirname(executable), 'resources.neu'), constants.R_OK);
  await access(icon, constants.R_OK);
  await mkdir(applications, { recursive: true });
  const temporary = await mkdtemp(join(applications, '.codex-ui-'));
  try {
    const pending = join(temporary, 'codex-ui.desktop');
    await writeFile(pending, entry, { mode: 0o644 });
    await rename(pending, path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { installed: true, path };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.platform !== 'linux') throw new Error('Desktop menu installation is supported on Linux only.');
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--if-present')) throw new Error('Usage: pnpm desktop:install [--if-present]');
  const result = await installDesktopEntry({ ifPresent: args.includes('--if-present') });
  if (result.installed) console.log('Desktop menu entry updated:', result.path);
}
