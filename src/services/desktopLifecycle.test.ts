import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDesktopLifecycle, shouldStartHidden } from './desktopLifecycle';
import { loadSettings, saveSettings } from './neutralinoBackend';
import { applyLinuxAutostart, autostartPath, buildAutostartEntry } from './linuxAutostart';
import config from '../../neutralino.config.json';

const settings = { refresh_interval_secs: 60, autostart: false, start_hidden: true, notify_at_90_pct: true };
const missing = { code: 'NE_FS_NOPATHE' };
const executable = '/home/其他用户/my app/neutralino-dist/codex-ui/bin/neutralino-linux_x64';
function host() {
  const handlers = new Map<string, (event: { detail: unknown }) => void>();
  const api = {
    app: { exit: vi.fn().mockResolvedValue(undefined) },
    events: { on: vi.fn((name, handler) => { handlers.set(name, handler); }) },
    window: { unminimize: vi.fn().mockResolvedValue(undefined), show: vi.fn().mockResolvedValue(undefined), hide: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined) },
    os: { getEnv: vi.fn().mockResolvedValue(''), getPath: vi.fn().mockResolvedValue('/home/test'), execCommand: vi.fn().mockResolvedValue({ stdOut: executable, exitCode: 0 }) },
    filesystem: {
      getStats: vi.fn().mockRejectedValue(missing), readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined),
      createDirectory: vi.fn().mockResolvedValue(undefined),
    },
    storage: { getData: vi.fn().mockResolvedValue(JSON.stringify(settings)), setData: vi.fn().mockResolvedValue(undefined) },
  };
  return { api: api as unknown as NeutralinoApi, mock: api, handlers };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('desktop background lifecycle', () => {
  it('ships native permissions and closes through the lifecycle handler', () => {
    expect(config.modes.window).toMatchObject({ hidden: false, exitProcessOnClose: false });
    for (const method of ['window.hide', 'window.show', 'window.unminimize', 'window.focus', 'os.setTray', 'filesystem.remove']) expect(config.nativeAllowList).toContain(method);
  });
  it('defaults old stored settings to silent startup without enabling autostart', async () => {
    const { mock, api } = host();
    mock.storage.getData.mockResolvedValue('{"autostart":false,"refresh_interval_secs":120}');
    vi.stubGlobal('window', { Neutralino: api });
    expect(await loadSettings()).toMatchObject({ start_hidden: true, autostart: false, refresh_interval_secs: 120 });
  });
  it.each([
    [true, [], true], [false, [], false], [false, ['--background'], true],
    [true, ['--show'], false], [true, ['--background', '--show'], false],
  ])('resolves saved preference %s with %j', (start_hidden, args, hidden) => {
    expect(shouldStartHidden({ start_hidden }, args)).toBe(hidden);
  });
  it('starts hidden without focus, restores from the menu, hides on close, and quits explicitly', async () => {
    const { api, mock, handlers } = host();
    const refresh = vi.fn();
    await initDesktopLifecycle(api, async () => settings, async () => true, refresh, []);
    expect(mock.window.show).not.toHaveBeenCalled();
    expect(mock.window.focus).not.toHaveBeenCalled();
    handlers.get('trayMenuItemClicked')!({ detail: { id: 'show' } });
    await settle();
    expect(mock.window.show).toHaveBeenCalledOnce();
    expect(mock.window.unminimize).toHaveBeenCalledOnce();
    expect(mock.window.focus).toHaveBeenCalledOnce();
    expect(mock.window.show.mock.invocationCallOrder[0]).toBeLessThan(mock.window.unminimize.mock.invocationCallOrder[0]);
    expect(mock.window.unminimize.mock.invocationCallOrder[0]).toBeLessThan(mock.window.focus.mock.invocationCallOrder[0]);
    handlers.get('windowClose')!({ detail: null });
    await settle();
    expect(mock.window.hide).toHaveBeenCalledTimes(2);
    expect(mock.app.exit).not.toHaveBeenCalled();
    handlers.get('trayMenuItemClicked')!({ detail: { id: 'refresh' } });
    expect(refresh).toHaveBeenCalledOnce();
    handlers.get('trayMenuItemClicked')!({ detail: { id: 'quit' } });
    expect(mock.app.exit).toHaveBeenCalledOnce();
  });
  it('shows the recovery window and allows closing when tray creation fails', async () => {
    const { api, mock, handlers } = host();
    await initDesktopLifecycle(api, async () => settings, async () => false, () => {}, ['--background']);
    expect(mock.window.show).toHaveBeenCalledOnce();
    expect(mock.window.hide).toHaveBeenCalledOnce();
    handlers.get('windowClose')!({ detail: null });
    await settle();
    expect(mock.app.exit).toHaveBeenCalledOnce();
  });
  it('hides immediately while tray initialization is pending', async () => {
    const { api, mock } = host();
    let ready!: (value: boolean) => void;
    const work = initDesktopLifecycle(api, async () => settings, () => new Promise(resolve => { ready = resolve; }), () => {}, []);
    await settle();
    expect(mock.window.hide).toHaveBeenCalledOnce();
    expect(mock.window.show).not.toHaveBeenCalled();
    ready(true);
    await work;
    expect(mock.window.hide).toHaveBeenCalledOnce();
  });
  it('finishes restoring before applying a subsequent hide request', async () => {
    const { api, mock, handlers } = host();
    await initDesktopLifecycle(api, async () => settings, async () => true, () => {}, []);
    let completeShow!: () => void;
    mock.window.show.mockImplementationOnce(() => new Promise<void>(resolve => { completeShow = resolve; }));
    handlers.get('trayMenuItemClicked')!({ detail: { id: 'show' } });
    await settle();
    handlers.get('trayMenuItemClicked')!({ detail: { id: 'hide' } });
    await settle();
    completeShow();
    await settle();
    const hideOrder = mock.window.hide.mock.invocationCallOrder;
    const focusOrder = mock.window.focus.mock.invocationCallOrder;
    expect(hideOrder[hideOrder.length - 1]).toBeGreaterThan(focusOrder[focusOrder.length - 1]);
  });
});

describe('Linux autostart host adaptation', () => {
  it('uses the XDG config directory and defaults invalid relative values to home', async () => {
    const { api, mock } = host();
    mock.os.getEnv.mockResolvedValue('/srv/自定义 config');
    expect(await autostartPath(api)).toBe('/srv/自定义 config/autostart/codex-ui.desktop');
    mock.os.getEnv.mockResolvedValue('relative');
    expect(await autostartPath(api)).toBe('/home/test/.config/autostart/codex-ui.desktop');
  });
  it('quotes desktop commands and escapes field codes and literal shell characters', () => {
    expect(buildAutostartEntry(executable)).toContain(`Exec="${executable}" --background\n`);
    const entry = buildAutostartEntry('/tmp/100%/a"$`\\b');
    expect(entry).toContain('100%%');
    expect(entry).toContain('\\\\"');
    expect(entry).toContain('\\\\$');
    expect(entry).toContain('\\\\`');
    expect(entry).toContain('\\\\\\\\b');
    expect(() => buildAutostartEntry('/tmp/bad\nExec=evil')).toThrow();
  });
  it('enables a built executable with background argument and can undo the new file', async () => {
    const { api, mock } = host();
    const undo = await applyLinuxAutostart(api, true, async () => executable);
    expect(mock.filesystem.writeFile).toHaveBeenCalledWith('/home/test/.config/autostart/codex-ui.desktop', buildAutostartEntry(executable));
    mock.filesystem.getStats.mockResolvedValue({ isFile: true } as never);
    await undo();
    expect(mock.filesystem.remove).toHaveBeenCalledWith('/home/test/.config/autostart/codex-ui.desktop');
  });
  it('disables an existing entry using the real client remove API', async () => {
    const { api, mock } = host();
    mock.filesystem.getStats.mockResolvedValue({ isFile: true } as never);
    mock.filesystem.readFile.mockResolvedValue('old desktop');
    const undo = await applyLinuxAutostart(api, false, vi.fn());
    expect(mock.filesystem.remove).toHaveBeenCalledOnce();
    await undo();
    expect(mock.filesystem.writeFile).toHaveBeenCalledWith('/home/test/.config/autostart/codex-ui.desktop', 'old desktop');
  });
  it('does not swallow removal or native permission failures', async () => {
    const { api, mock } = host();
    mock.filesystem.getStats.mockResolvedValue({ isFile: true } as never);
    mock.filesystem.readFile.mockResolvedValue('old desktop');
    mock.filesystem.remove.mockRejectedValue(new Error('cannot remove'));
    await expect(applyLinuxAutostart(api, false, vi.fn())).rejects.toThrow('cannot remove');
    mock.filesystem.getStats.mockRejectedValue({ code: 'NE_RT_NATPRME' });
    await expect(applyLinuxAutostart(api, false, vi.fn())).rejects.toEqual({ code: 'NE_RT_NATPRME' });
  });
  it('treats a missing entry as already disabled', async () => {
    const { api, mock } = host();
    await applyLinuxAutostart(api, false, vi.fn());
    expect(mock.filesystem.remove).not.toHaveBeenCalled();
  });
  it('restores an existing entry if the new write fails', async () => {
    const { api, mock } = host();
    mock.filesystem.getStats.mockResolvedValue({ isFile: true } as never);
    mock.filesystem.readFile.mockResolvedValue('previous desktop');
    mock.filesystem.writeFile.mockRejectedValueOnce(new Error('write failed'));
    await expect(applyLinuxAutostart(api, true, async () => executable)).rejects.toThrow('write failed');
    expect(mock.filesystem.writeFile).toHaveBeenLastCalledWith('/home/test/.config/autostart/codex-ui.desktop', 'previous desktop');
  });
  it('rejects development binaries before modifying autostart', async () => {
    const { api, mock } = host();
    await expect(applyLinuxAutostart(api, true, async () => '/tmp/bin/neutralino')).rejects.toThrow('发布版');
    expect(mock.filesystem.writeFile).not.toHaveBeenCalled();
  });
  it('restores the previous desktop entry when settings persistence fails', async () => {
    const { api, mock } = host();
    mock.filesystem.getStats.mockResolvedValue({ isFile: true } as never);
    mock.filesystem.readFile.mockResolvedValue('previous desktop');
    mock.storage.setData.mockRejectedValue(new Error('storage failed'));
    vi.stubGlobal('window', { Neutralino: api });
    vi.stubGlobal('NL_OS', 'Linux');
    await expect(saveSettings({ ...settings, autostart: true })).rejects.toThrow('storage failed');
    expect(mock.filesystem.writeFile).toHaveBeenLastCalledWith('/home/test/.config/autostart/codex-ui.desktop', 'previous desktop');
  });
});
