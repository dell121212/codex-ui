import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { verifyDesktopPackage } from '../scripts/verify-desktop-package.mjs';

const requireFromNeu = createRequire(import.meta.resolve('@neutralinojs/neu'));
const { createPackage } = requireFromNeu('@electron/asar');
const root = resolve('.');

for (const variant of ['valid', 'missing-tray', 'empty-tray', 'corrupt-tray', 'missing-page', 'missing-permission']) {
  test(`desktop package: ${variant}`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'codex-ui-package-'));
    try {
      const staging = join(temporary, 'staging');
      await mkdir(join(staging, 'dist/icons'), { recursive: true });
      await mkdir(join(staging, 'public/icons'), { recursive: true });
      const config = JSON.parse(await readFile(join(root, 'neutralino.config.json'), 'utf8'));
      if (variant === 'missing-permission') config.nativeAllowList = config.nativeAllowList.filter(method => method !== 'resources.getStats');
      await writeFile(join(staging, 'neutralino.config.json'), JSON.stringify(config));
      await copyFile(join(root, 'neutralino.js'), join(staging, 'neutralino.js'));
      await copyFile(join(root, 'public/icons/app.png'), join(staging, 'public/icons/app.png'));
      if (variant !== 'missing-page') await writeFile(join(staging, 'dist/index.html'), '<html>test app</html>');
      if (variant === 'empty-tray' || variant === 'corrupt-tray') {
        await writeFile(join(staging, 'dist/icons/tray.png'), variant === 'empty-tray' ? '' : 'broken PNG');
      } else if (variant !== 'missing-tray') {
        await copyFile(join(root, 'public/icons/tray.png'), join(staging, 'dist/icons/tray.png'));
      }
      const archive = join(temporary, 'resources.neu');
      await createPackage(staging, archive);
      if (variant === 'valid') await verifyDesktopPackage(archive);
      else await assert.rejects(verifyDesktopPackage(archive), variant === 'missing-permission' ? /Missing native permission: resources.getStats/ : variant === 'missing-page' ? /dist\/index.html/ : /dist\/icons\/tray.png/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
