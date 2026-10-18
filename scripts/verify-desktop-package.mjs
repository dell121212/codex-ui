import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reuse neu's archive reader rather than maintaining another ASAR parser.
const requireFromNeu = createRequire(import.meta.resolve('@neutralinojs/neu'));
const { extractFile } = requireFromNeu('@electron/asar');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function verifyDesktopPackage(archive) {
  const requiredFile = (path) => {
    try {
      const bytes = extractFile(archive, path.replace(/^\/+/, ''));
      assert(bytes.length > 0, 'empty file');
      return bytes;
    } catch (error) {
      throw new Error(`Invalid packaged resource ${path}: ${error.message}`);
    }
  };
  const config = JSON.parse(requiredFile('/neutralino.config.json').toString());
  const allowed = config.nativeAllowList ?? [];
  for (const method of ['resources.getStats', 'os.setTray', 'window.show', 'window.hide', 'window.unminimize', 'window.focus']) {
    assert(allowed.includes(method) || allowed.includes('*') || allowed.includes(`${method.split('.')[0]}.*`), `Missing native permission: ${method}`);
  }
  const resources = JSON.parse(await readFile(join(root, 'src/desktop-resources.json'), 'utf8'));
  requiredFile(`${config.documentRoot.replace(/\/+$/, '')}/index.html`);
  requiredFile(config.cli.clientLibrary);
  for (const [resource, source] of [
    [resources.trayIcon, 'public/icons/tray.png'],
    [config.modes.window.icon, config.modes.window.icon.replace(/^\/+/, '')],
  ]) {
    const actual = requiredFile(resource);
    const expected = await readFile(join(root, source));
    assert(actual.equals(expected), `Packaged icon differs from source: ${resource}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(await readFile(join(root, 'neutralino.config.json'), 'utf8'));
  const archive = process.argv[2] ?? join(root, config.cli.distributionPath.replace(/^\/+/, ''), config.cli.binaryName, 'bin/resources.neu');
  await verifyDesktopPackage(archive);
  console.log('Desktop package resources verified:', archive);
}
