import { File, Directory, Paths } from 'expo-file-system';
import { cacheFileName } from '@/services/uri-resolver';

export interface ArchiveEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export type ArchiveFormat = 'zip' | 'rar' | '7z' | 'tar' | 'cbr' | 'cbz' | 'unknown';

export function detectArchiveFormat(filePath: string): ArchiveFormat {
  const lower = filePath.toLowerCase();
  // Handle compound extensions like .tar.gz
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar';
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'zip': return 'zip';
    case 'cbz': return 'cbz';
    case 'rar': return 'rar';
    case 'cbr': return 'cbr';
    case '7z': return '7z';
    case 'tar': return 'tar';
    case 'gz':
    case 'bz2':
    case 'xz': return 'tar';
    default: return 'unknown';
  }
}

async function resolveArchivePath(filePath: string): Promise<string> {
  if (!filePath.startsWith('content://')) return filePath;
  try {
    const src = new File(filePath);
    const info = src.info();
    if (!info.exists) return filePath;
    const cacheDir = new Directory(Paths.cache, 'archive-cache');
    try { await cacheDir.create({ intermediates: true }); } catch {}
    const ext = detectArchiveFormat(filePath) === 'unknown' ? 'zip' : filePath.split('.').pop() || 'zip';
    const tmp = new File(cacheDir, cacheFileName(filePath, `archive.${ext}`));
    if (tmp.exists) return tmp.uri;
    const { FileMode } = await import('expo-file-system');
    try {
      const handle = src.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(info.size ?? 0);
        if (bytes.length > 0) tmp.write(bytes);
        else {
          const buf = await src.arrayBuffer();
          tmp.write(new Uint8Array(buf));
        }
      } finally { handle.close(); }
    } catch {
      const buf = await src.arrayBuffer();
      tmp.write(new Uint8Array(buf));
    }
    return tmp.uri;
  } catch { return filePath; }
}

function parseTarHeader(view: DataView, offset: number): { name: string; size: number; type: string } | null {
  const decoder = new TextDecoder();
  const name = decoder.decode(new Uint8Array(view.buffer, offset, 100)).replace(/\0/g, '').trim();
  if (!name) return null;
  const sizeStr = decoder.decode(new Uint8Array(view.buffer, offset + 124, 12)).replace(/\0/g, '').trim();
  const size = parseInt(sizeStr, 8);
  if (isNaN(size)) return null;
  const type = String.fromCharCode(view.getUint8(offset + 156));
  return { name, size, type };
}

async function getTempDir(): Promise<Directory> {
  const dir = new Directory(Paths.cache, 'archive-temp');
  await dir.create({ intermediates: true });
  return dir;
}

export async function listArchiveEntries(filePath: string): Promise<ArchiveEntry[]> {
  const resolved = await resolveArchivePath(filePath);
  const format = detectArchiveFormat(resolved);

  if (format === 'zip' || format === 'cbz') {
    return listZipEntries(resolved);
  }

  if (format === 'tar') {
    return listTarEntries(resolved);
  }

  throw new Error(
    `${format.toUpperCase()} archives are not yet supported natively. ` +
    `Please convert to ZIP or CBZ format. Support for ${format.toUpperCase()} will be added in a future update.`
  );
}

async function listZipEntries(filePath: string): Promise<ArchiveEntry[]> {
  const file = new File(filePath);
  const buffer = await file.arrayBuffer();
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const entries: ArchiveEntry[] = [];
  const promises: Promise<void>[] = [];
  zip.forEach((relativePath, entry) => {
    // size via async content length when available; fallback to 0 for dirs
    const push = async () => {
      let size = 0;
      if (!entry.dir) {
        try {
          const data = await entry.async('uint8array');
          size = data.byteLength;
        } catch { size = 0; }
      }
      entries.push({
        name: relativePath.replace(/\/$/, '').split('/').pop() || relativePath,
        path: relativePath,
        isDirectory: entry.dir,
        size,
      });
    };
    promises.push(push());
  });
  await Promise.all(promises);
  entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

async function listTarEntries(filePath: string): Promise<ArchiveEntry[]> {
  const file = new File(filePath);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ArchiveEntry[] = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = parseTarHeader(view, offset);
    if (!header) break;

    entries.push({
      name: header.name.split('/').pop() || header.name,
      path: header.name,
      isDirectory: header.type === '5',
      size: header.size,
    });

    const blockSize = Math.ceil(header.size / 512) * 512;
    offset += 512 + blockSize;
    if (offset >= bytes.length) break;
  }

  entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

export async function extractEntry(filePath: string, entryPath: string): Promise<string> {
  const resolved = await resolveArchivePath(filePath);
  const format = detectArchiveFormat(resolved);

  // Guard against loading extremely large archives fully into memory (OOM crash path).
  try {
    const size = new File(resolved).info().size ?? 0;
    if (size > 300 * 1024 * 1024) {
      throw new Error('This archive is too large to extract in this version (over 300 MB).');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('too large')) throw e;
  }

  if (format === 'zip' || format === 'cbz') {
    return extractZipEntry(resolved, entryPath);
  }

  if (format === 'tar') {
    return extractTarEntry(resolved, entryPath);
  }

  throw new Error(`Extraction not supported for ${format} archives`);
}

async function extractZipEntry(filePath: string, entryPath: string): Promise<string> {
  const file = new File(filePath);
  const buffer = await file.arrayBuffer();
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.files[entryPath];
  if (!entry || entry.dir) throw new Error('Not a file');
  const data = await entry.async('uint8array');
  const ext = entryPath.split('.').pop() || 'bin';
  const tempDir = await getTempDir();
  const tempFile = new File(tempDir, `archive_${Date.now()}.${ext}`);
  await tempFile.write(data);
  return tempFile.uri;
}

async function extractTarEntry(filePath: string, entryPath: string): Promise<string> {
  const file = new File(filePath);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = parseTarHeader(view, offset);
    if (!header) break;
    if (header.name === entryPath && header.type !== '5') {
      // Copy bytes to avoid referencing underlying buffer beyond slice
      const src = bytes.subarray(offset + 512, offset + 512 + header.size);
      const contentBytes = new Uint8Array(src);
      const ext = entryPath.split('.').pop()?.split('?')[0] || 'bin';
      const tempDir = await getTempDir();
      const tempFile = new File(tempDir, `archive_${Date.now()}.${ext}`);
      await tempFile.write(contentBytes);
      return tempFile.uri;
    }
    const blockSize = Math.ceil(header.size / 512) * 512;
    offset += 512 + blockSize;
    if (offset >= bytes.length) break;
  }

  throw new Error('File not found in archive');
}
