import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exercise the production adapters against real GTK/Neutralino APIs with isolated data.
// Requires a graphical Linux session and the installed AppIndicator library.
const requireFromVite = createRequire(import.meta.resolve('vite'));
const { build } = requireFromVite('esbuild');
const requireFromNeu = createRequire(import.meta.resolve('@neutralinojs/neu'));
const { createPackage } = requireFromNeu('@electron/asar');
const root = resolve('.');
const binary = join(root, 'neutralino-dist/codex-ui/bin/neutralino-linux_x64');
const temporary = await mkdtemp(join(tmpdir(), 'codex-ui-desktop-test-'));
const resources = join(temporary, 'resources');
let child;
try {
  await mkdir(join(resources, 'dist/icons'), { recursive: true });
  await copyFile(join(root, 'neutralino.js'), join(resources, 'neutralino.js'));
  await copyFile(join(root, 'public/icons/tray.png'), join(resources, 'dist/icons/tray.png'));
  const config = JSON.parse(await readFile(join(root, 'neutralino.config.json'), 'utf8'));
  config.applicationId = 'com.codex.ui.desktop.regression';
  config.storageLocation = 'app';
  config.dataLocation = 'app';
  config.nativeAllowList.push('window.isVisible', 'window.minimize', 'window.isMinimized');
  config.modes.window.icon = '/dist/icons/tray.png';
  await writeFile(join(resources, 'neutralino.config.json'), JSON.stringify(config));
  await writeFile(join(temporary, 'click-tray.py'), `import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import Gio, GLib, GdkPixbuf
import sys
bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
items=bus.call_sync('org.kde.StatusNotifierWatcher','/StatusNotifierWatcher','org.freedesktop.DBus.Properties','Get',GLib.Variant('(ss)',('org.kde.StatusNotifierWatcher','RegisteredStatusNotifierItems')),None,Gio.DBusCallFlags.NONE,3000,None).unpack()[0]
for item in items:
 service,path=item.split('@',1)
 props=bus.call_sync(service,path,'org.freedesktop.DBus.Properties','GetAll',GLib.Variant('(s)',('org.kde.StatusNotifierItem',)),None,Gio.DBusCallFlags.NONE,3000,None).unpack()[0]
 if ${JSON.stringify(temporary)} not in props.get('IconName',''): continue
 GdkPixbuf.Pixbuf.new_from_file(props['IconName'])
 menu=Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,None,service,props['Menu'],'com.canonical.dbusmenu',None)
 layout=menu.call_sync('GetLayout',GLib.Variant('(iias)',(0,-1,[])),Gio.DBusCallFlags.NONE,3000,None).unpack()[1]
 for child in layout[2]:
  if child[1].get('label')==sys.argv[1]:
   menu.call_sync('Event',GLib.Variant('(isvu)',(child[0],'clicked',GLib.Variant('i',0),0)),Gio.DBusCallFlags.NONE,3000,None)
   sys.exit(0)
raise RuntimeError('test tray menu not found')
`);
  await writeFile(join(temporary, 'mapped.py'), `import subprocess, re, sys
pid=sys.argv[1]
states=[]
for line in subprocess.check_output(['xwininfo','-root','-tree'],text=True).splitlines():
 if '"codex-ui"' not in line: continue
 xid=re.search(r'0x[0-9a-f]+',line).group(0)
 prop=subprocess.check_output(['xprop','-id',xid,'_NET_WM_PID'],text=True)
 if prop.strip().endswith('= '+pid):
  state=subprocess.check_output(['xwininfo','-id',xid],text=True)
  states.append('Map State: IsViewable' in state)
if not states: raise RuntimeError('window not found')
print('mapped' if any(states) else 'unmapped')
`);
  await writeFile(join(resources, 'dist/index.html'), '<!doctype html><html><body><script src="/probe.js"></script></body></html>');
  await build({
    stdin: {
      resolveDir: root,
      contents: `
import { initDesktopLifecycle } from './src/services/desktopLifecycle';
import { loadSettings, saveSettings, configureTray } from './src/services/neutralinoBackend';
import { buildAutostartEntry, autostartPath } from './src/services/linuxAutostart';
const api = window.Neutralino;
api.init();
const wait = () => new Promise(resolve => setTimeout(resolve, 500));
const assert = (value, message) => { if (!value) throw new Error(message); };
const clickTray = async label => {
  const out = await api.os.execCommand('python3 ' + ${JSON.stringify(join(temporary, 'click-tray.py'))} + ' ' + label);
  assert(out.exitCode === 0, 'native tray click failed: ' + out.stdErr);
};
(async () => {
  await initDesktopLifecycle(api, loadSettings, async () => {
    return configureTray(0, 0, '额度');
  }, () => {}, ['--background']);
  assert(!(await api.window.isVisible()), 'background startup must stay hidden');
  await clickTray('显示窗口');
  await wait();
  assert(await api.window.isVisible(), 'tray show must restore the window');
  const mapped = async () => (await api.os.execCommand('python3 ' + ${JSON.stringify(join(temporary, 'mapped.py'))} + ' ' + NL_PID));
  const firstMap = await mapped();
  assert(firstMap.stdOut.trim() === 'mapped', 'GTK visibility must map a real desktop window: ' + JSON.stringify(firstMap));
  await api.window.minimize();
  await wait();
  await clickTray('显示窗口');
  await wait();
  const restoredMap = await mapped();
  assert(restoredMap.stdOut.trim() === 'mapped', 'tray show must restore a minimized window: ' + JSON.stringify(restoredMap));
  await clickTray('隐藏到托盘');
  await wait();
  assert(!(await api.window.isVisible()), 'tray hide must hide the window');
  await clickTray('显示窗口');
  await wait();
  assert((await mapped()).stdOut.trim() === 'mapped', 'tray must restore a previously hidden window');
  await api.events.dispatch('windowClose');
  await wait();
  assert(!(await api.window.isVisible()), 'close must hide without exiting');
  const settings = { ...(await loadSettings()), autostart: true, start_hidden: true };
  await saveSettings(settings);
  assert((await loadSettings()).autostart, 'settings must persist autostart');
  const path = await autostartPath(api);
  assert((await api.filesystem.readFile(path)) === buildAutostartEntry(${JSON.stringify(binary)}), 'real XDG entry must point to release binary with background flag');
  await saveSettings({ ...settings, autostart: false });
  let missing = false;
  try { await api.filesystem.getStats(path); } catch(error) { missing = error.code === 'NE_FS_NOPATHE'; }
  assert(missing, 'disabling must remove the actual file');
  await api.filesystem.writeFile(${JSON.stringify(join(temporary, 'result.json'))}, JSON.stringify({ passed: true, bundledTrayIconDecoded: true, hiddenAfterClose: true, restoredAfterMinimize: true, realTrayClicks: true, autostartEnabledAndRemoved: true }));
  await api.events.dispatch('trayMenuItemClicked', { id: 'quit' });
})().catch(async error => {
  await api.filesystem.writeFile(${JSON.stringify(join(temporary, 'result.json'))}, JSON.stringify({ passed: false, error: String(error), code: error.code }));
  await api.app.exit(1);
});`,
    },
    bundle: true, format: 'iife', outfile: join(resources, 'dist/probe.js'),
  });
  await createPackage(resources, join(temporary, 'resources.neu'));
  child = spawn(binary, [`--path=${temporary}`, '--background', '--window-use-saved-state=false'], {
    env: { ...process.env, WEBKIT_DISABLE_COMPOSITING_MODE: '1', XDG_CONFIG_HOME: join(temporary, 'config') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill('SIGTERM'), 25000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
  clearTimeout(timer);
  let result;
  try { result = JSON.parse(await readFile(join(temporary, 'result.json'), 'utf8')); }
  catch { throw new Error(`Desktop probe did not complete (exit ${code}): ${output}`); }
  if (!result.passed || code !== 0) throw new Error(`Desktop regression failed: ${JSON.stringify(result)} ${output}`);
  console.log('Real Linux desktop regression passed:', result);
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await rm(temporary, { recursive: true, force: true });
}
