export interface FileApi {
  readFile: (path: string) => Promise<string>;
  readDirectory: (path: string) => Promise<Array<{ entry: string; type: string }>>;
  getStats?: (path: string) => Promise<{ modifiedAt: number; size: number }>;
}

export async function pathExists(api: FileApi, path: string): Promise<boolean> {
  try {
    await api.readDirectory(path);
    return true;
  } catch {
    try {
      await api.readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** Recursively list matching files under a directory, within a fixed depth. */
export async function walkFiles(
  api: FileApi,
  dir: string,
  match: (name: string) => boolean,
  depth = 0,
  maxDepth = 6,
): Promise<string[]> {
  if (depth > maxDepth) return [];

  let entries: Array<{ entry: string; type: string }>;
  try {
    entries = await api.readDirectory(dir);
  } catch {
    return [];
  }

  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = `${dir}/${entry.entry}`;
    if (entry.type === 'DIRECTORY') {
      return walkFiles(api, fullPath, match, depth + 1, maxDepth);
    }
    return entry.type === 'FILE' && match(entry.entry) ? [fullPath] : [];
  }));
  return nested.flat();
}
