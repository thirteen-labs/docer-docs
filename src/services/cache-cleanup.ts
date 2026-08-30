import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

const CACHE_LIMIT_BYTES: Record<string, number> = {
  'reader-cache': 200 * 1024 * 1024,
  'pdf-cache': 200 * 1024 * 1024,
  'office-cache': 150 * 1024 * 1024,
  'archive-cache': 150 * 1024 * 1024,
  'archive-temp': 100 * 1024 * 1024,
  'epub-cache': 150 * 1024 * 1024,
};

async function trimDir(name: string, maxBytes: number): Promise<void> {
  const dir = new Directory(Paths.cache, name);
  let entries: (File | Directory)[];
  try {
    entries = dir.list();
  } catch {
    return;
  }

  const files = entries.filter((e): e is File => e instanceof File);
  const stats = await Promise.all(
    files.map(async (file) => {
      const info = await file.info();
      return { file, size: info.size ?? 0, mtime: info.modificationTime ?? 0 };
    })
  );

  const total = stats.reduce((sum, s) => sum + s.size, 0);
  if (total <= maxBytes) return;

  let used = total;
  stats
    .sort((a, b) => a.mtime - b.mtime)
    .forEach((s) => {
      if (used <= maxBytes) return;
      used -= s.size;
      FileSystem.deleteAsync(s.file.uri, { idempotent: true }).catch(() => {});
    });
}

export async function enforceCacheLimit(): Promise<void> {
  await Promise.all(
    Object.entries(CACHE_LIMIT_BYTES).map(([name, limit]) => trimDir(name, limit).catch(() => {}))
  );
}
