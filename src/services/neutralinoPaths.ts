/** Keep home-directory lookup compatible with the pinned Neutralino 6.5 runtime. */
export async function getHomePath(os: Pick<NeutralinoApi['os'], 'getPath' | 'getEnv'> | undefined): Promise<string> {
  if (!os) throw new Error('Neutralino 运行时不可用');
  try {
    const home = await os.getPath('home');
    if (home) return home;
  } catch (error) {
    // Only fall back for the unsupported path; permission/connection errors matter.
    if ((error as { code?: string } | null)?.code !== 'NE_OS_INVKNPT') throw error;
  }
  const home = await os.getEnv('HOME');
  if (!home.trim() || !home.startsWith('/')) throw new Error('无法读取有效的 HOME 目录');
  return home;
}
