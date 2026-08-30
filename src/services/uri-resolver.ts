import { File, Paths, Directory } from 'expo-file-system';

function isContentUri(uri: string): boolean {
  return uri.startsWith('content://');
}

/**
 * Deterministic cache file name derived from the source URI so the same document
 * is copied to cache only once (instead of being re-copied on every open, which
 * previously churned the cache and wasted I/O because a Date.now() name never matched).
 */
export function cacheFileName(source: string, name: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (Math.imul(h, 31) + source.charCodeAt(i)) | 0;
  }
  const safe = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  return `${(h >>> 0).toString(36)}_${safe}`;
}

/**
 * Ensure a document URI is a local file:// path that readers and extractors can
 * open. For content:// (MediaStore/SAF) URIs this copies the bytes into the app
 * cache and returns the cached file:// URI. Non-content URIs are returned as-is.
 */
export async function ensureLocalUri(uri: string, fileName: string): Promise<string> {
  if (!isContentUri(uri)) return uri;
  try {
    const source = new File(uri);
    const info = source.info();
    if (!info.exists) return uri;
    const cacheDir = new Directory(Paths.cache, 'reader-cache');
    try { await cacheDir.create({ intermediates: true }); } catch {}
    const localFile = new File(cacheDir, cacheFileName(uri, fileName));
    if (localFile.exists) {
      return localFile.uri;
    }
    const { FileMode } = await import('expo-file-system');
    try {
      const handle = source.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(info.size ?? 0);
        const data = bytes.length > 0 ? bytes : new Uint8Array(await source.arrayBuffer());
        localFile.write(data);
      } finally {
        handle.close();
      }
    } catch {
      const buf = await source.arrayBuffer();
      localFile.write(new Uint8Array(buf));
    }
    return localFile.uri;
  } catch {
    return uri;
  }
}
