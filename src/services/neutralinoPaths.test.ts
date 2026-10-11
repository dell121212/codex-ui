import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHomePath } from './neutralinoPaths';
import { getAuthStatus } from './neutralinoBackend';
import runtimeConfig from '../../neutralino.config.json';

afterEach(() => vi.unstubAllGlobals());

describe('Neutralino home directory compatibility', () => {
  it.each(['/home/test', '/home/其他用户', '/srv/custom-home'])('reads Codex auth from %s with the pinned runtime', async (home) => {
    const os = {
      getPath: vi.fn().mockRejectedValue({ code: 'NE_OS_INVKNPT' }),
      getEnv: vi.fn(async () => {
        // Exercise the shipped permission contract rather than an unrestricted mock.
        if (!runtimeConfig.nativeAllowList.includes('os.getEnv')) throw { code: 'NE_RT_NATPRME' };
        return home;
      }),
    };
    const readFile = vi.fn().mockResolvedValue(JSON.stringify({ tokens: { access_token: 'test-token' } }));
    vi.stubGlobal('window', { Neutralino: { os, filesystem: { readFile } } });
    expect(await getAuthStatus()).toMatchObject({ source: 'codex', auth_path: `${home}/.codex/auth.json` });
    expect(readFile).toHaveBeenCalledWith(`${home}/.codex/auth.json`);
    expect(os.getEnv).toHaveBeenCalledWith('HOME');
  });

  it('uses the native path when supported', async () => {
    const os = { getPath: vi.fn().mockResolvedValue('/home/test'), getEnv: vi.fn() };
    expect(await getHomePath(os)).toBe('/home/test');
    expect(os.getEnv).not.toHaveBeenCalled();
  });

  it('also handles old runtimes returning an empty path', async () => {
    expect(await getHomePath({ getPath: vi.fn().mockResolvedValue(''), getEnv: vi.fn().mockResolvedValue('/home/test') })).toBe('/home/test');
  });

  it('preserves native permission errors', async () => {
    const error = { code: 'NE_RT_NATPRME' };
    const os = { getPath: vi.fn().mockRejectedValue(error), getEnv: vi.fn() };
    await expect(getHomePath(os)).rejects.toBe(error);
    expect(os.getEnv).not.toHaveBeenCalled();
  });

  it('rejects missing HOME rather than reading relative paths', async () => {
    await expect(getHomePath({ getPath: vi.fn().mockResolvedValue(''), getEnv: vi.fn().mockResolvedValue('') })).rejects.toThrow('HOME');
  });
});
