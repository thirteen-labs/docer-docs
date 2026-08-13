import { Platform } from 'react-native';
import DocumentScannerModule, {
  type ScannedDocument,
  type StorageDirectory,
} from '@/document-scanner';
import type { DiscoveredDocument, DocumentSource } from '@/types/discovery';
import { hashString } from '@/utils/hash';
import {
  getExtension,
  getClassification,
  isSupportedExtension,
  SUPPORTED_EXTENSIONS,
} from '@/services/discovery/registry';

/**
 * Android filesystem scanner.
 *
 * Uses the native `DocumentScanner` module to recursively walk user-accessible
 * directories (Downloads, Documents, internal storage, SD cards). System
 * directories (Android/data, obb, cache, .thumbnails) are skipped natively.
 */
const FILESYSTEM_SOURCE: DocumentSource = 'filesystem';
const FOLDER_SOURCE: DocumentSource = 'folder';

function toDiscoveredDocument(doc: ScannedDocument, source: DocumentSource): DiscoveredDocument | null {
  if (!isSupportedExtension(doc.name)) return null;
  return {
    id: hashString(doc.uri),
    name: doc.name,
    uri: doc.uri,
    extension: getExtension(doc.name),
    size: doc.size || 0,
    modifiedAt: doc.lastModified || undefined,
    source,
    accessible: true,
    classification: getClassification(doc.name),
  };
}

export async function hasFilesystemPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await DocumentScannerModule.hasStoragePermission();
  } catch {
    return false;
  }
}

export async function requestFilesystemPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await DocumentScannerModule.requestStoragePermission();
  } catch {
    return false;
  }
}

export async function getStorageDirectories(): Promise<StorageDirectory[]> {
  if (Platform.OS !== 'android') return [];
  try {
    return await DocumentScannerModule.getStorageDirectories();
  } catch {
    return [];
  }
}

export interface ScanFilesystemOptions {
  signal?: AbortSignal;
  /** Per-directory progress callback with cumulative counts. */
  onProgress?: (currentPath: string, filesFound: number) => void;
}

/**
 * Scans the common document directories (Downloads, Documents, internal
 * storage) and returns every supported file as a reference document.
 */
export async function scanCommonDirectories(options: ScanFilesystemOptions = {}): Promise<DiscoveredDocument[]> {
  if (Platform.OS !== 'android') return [];

  const hasPermission = await hasFilesystemPermission();
  if (!hasPermission) return [];

  let dirs: StorageDirectory[] = [];
  try {
    dirs = await DocumentScannerModule.getCommonDocumentDirs();
  } catch {
    return [];
  }

  const allDocs: DiscoveredDocument[] = [];
  for (const dir of dirs) {
    if (options.signal?.aborted) break;
    try {
      options.onProgress?.(dir.name, allDocs.length);
      const scanned = await DocumentScannerModule.scanDirectory(
        dir.path,
        SUPPORTED_EXTENSIONS
      );
      for (const doc of scanned) {
        const discovered = toDiscoveredDocument(doc, FILESYSTEM_SOURCE);
        if (discovered) allDocs.push(discovered);
      }
    } catch {
      // Skip directories that are not accessible.
    }
  }
  return allDocs;
}

/**
 * Scans a specific user-chosen path. Returned documents are tagged as
 * `folder` so reconciliation can track them as "connected locations".
 */
export async function scanPath(
  path: string,
  options: ScanFilesystemOptions = {}
): Promise<DiscoveredDocument[]> {
  if (Platform.OS !== 'android') return [];

  const hasPermission = await hasFilesystemPermission();
  if (!hasPermission) return [];

  try {
    options.onProgress?.(path, 0);
    const scanned = await DocumentScannerModule.scanDirectory(path, SUPPORTED_EXTENSIONS);
    const docs: DiscoveredDocument[] = [];
    for (const doc of scanned) {
      if (options.signal?.aborted) break;
      const discovered = toDiscoveredDocument(doc, FOLDER_SOURCE);
      if (discovered) docs.push(discovered);
    }
    return docs;
  } catch {
    return [];
  }
}
