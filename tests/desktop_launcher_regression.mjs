import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { installDesktopEntry } from '../scripts/install-desktop-entry.mjs';

async function fixture(run) {
  const temporary = await mkdtemp(join(tmpdir(), 'codex-ui-launcher-'));
  try {
    const root = join(temporary, '中文 repo 100% "quote" $dollar `tick` \\slash');
    const bin = join(root, 'neutralino-dist/codex-ui/bin');
    await mkdir(bin, { recursive: true });
    await mkdir(join(root, 'public/icons'), { recursive: true });
    const executable = join(bin, 'neutralino-linux_x64');
    await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@" > "$LAUNCHER_PROBE"\n', { mode: 0o755 });
    await writeFile(join(bin, 'resources.neu'), 'fixture');
    await writeFile(join(root, 'public/icons/app.png'), 'fixture');
    const env = { ...process.env, HOME: join(temporary, 'home'), XDG_DATA_HOME: join(temporary, 'data') };
    await run({ temporary, root, executable, env });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test('repairs stale checkout paths and really launches the current binary with --show', async () => {
  await fixture(async ({ temporary, root, env }) => {
    const path = join(env.XDG_DATA_HOME, 'applications/codex-ui.desktop');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '[Desktop Entry]\nType=Application\nName=codex-ui\nExec=/removed/checkout/codex-ui\n');
    const result = await installDesktopEntry({ root, env, ifPresent: true });
    assert.equal(result.installed, true);
    assert.equal(result.path, path);
    const entry = await readFile(path, 'utf8');
    assert.ok(!entry.includes('/removed/checkout'));
    assert.ok(entry.includes(' --show\n'));
    assert.ok(!entry.includes('--background'));
    const probe = join(temporary, 'args.txt');
    const launch = spawnSync('gio', ['launch', path], { env: { ...env, LAUNCHER_PROBE: probe }, encoding: 'utf8' });
    assert.equal(launch.status, 0, launch.stderr);
    // GIO launches asynchronously; wait for the fake executable to record argv.
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        assert.equal(await readFile(probe, 'utf8'), '--show\n');
        return;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    assert.fail('GIO did not execute the generated launcher');
  });
});

test('uses XDG data home and falls back for empty or relative values', async () => {
  await fixture(async ({ root, env }) => {
    for (const dataHome of [env.XDG_DATA_HOME, '', 'relative/data']) {
      const result = await installDesktopEntry({ root, env: { ...env, XDG_DATA_HOME: dataHome } });
      assert.equal(result.path, join(dataHome.startsWith('/') ? dataHome : join(env.HOME, '.local/share'), 'applications/codex-ui.desktop'));
      assert.ok((await readFile(result.path, 'utf8')).includes('[Desktop Entry]'));
    }
  });
});

test('normal startup refresh does not create an unrequested menu entry', async () => {
  await fixture(async ({ root, env }) => {
    const result = await installDesktopEntry({ root, env, ifPresent: true });
    assert.equal(result.installed, false);
    await assert.rejects(readFile(result.path), { code: 'ENOENT' });
  });
});

test('a missing build preserves an existing working entry', async () => {
  await fixture(async ({ root, env, executable }) => {
    const result = await installDesktopEntry({ root, env });
    const previous = await readFile(result.path, 'utf8');
    for (const path of [executable, join(dirname(executable), 'resources.neu'), join(root, 'public/icons/app.png')]) {
      const bytes = await readFile(path);
      await rm(path);
      await assert.rejects(installDesktopEntry({ root, env }));
      assert.equal(await readFile(result.path, 'utf8'), previous);
      await writeFile(path, bytes, { mode: 0o755 });
    }
    await assert.rejects(installDesktopEntry({ root: root + '=invalid', env }), /等号/);
    assert.equal(await readFile(result.path, 'utf8'), previous);
  });
});
