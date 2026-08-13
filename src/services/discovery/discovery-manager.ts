import { Platform } from 'react-native';
import type { Document } from '@/types';
import type {
  DiscoveredDocument,
  DiscoveryOptions,
  DiscoveryProgress,
  DiscoveryResult,
  DocumentSource,
  ReconcileResult,
} from '@/types/discovery';
import { importFile, type ImportOptions } from '@/services/import-service';
import { getDb } from '@/db/connection';
import { getAllDocuments, getDocumentByPath, deleteDocument } from '@/db/documents';
import { deleteDocumentContent } from '@/db/content-index';
import { validateSignature } from '@/services/discovery/signatures';
import {
  scanMediaStore,
  ensureMediaStorePermissions,
  hasMediaStorePermissions,
  lookupMediaStoreItem,
} from '@/services/discovery/android/mediastore-scanner';
import {
  scanCommonDirectories,
  scanPath,
  hasFilesystemPermission,
  requestFilesystemPermission,
} from '@/services/discovery/android/filesystem-scanner';
import {
  pickAndScanFolder,
  rescanConnectedLocations,
} from '@/services/discovery/ios/folder-scanner';
import { isSupportedExtension } from '@/services/discovery/registry';
import { File } from 'expo-file-system';
import type { MediaChangeEvent } from '@obsidian_north/react-native-mediastore';

const INDEXABLE_TYPES = new Set(['epub', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'code']);

/**
 * Central orchestrator for device-wide document discovery.
 *
 * Coordinates platform-specific scanners (MediaStore, SAF, filesystem, folder
 * picker) and indexes discovered documents as URI references — never copies.
 * Reconcile ensures the DB stays in sync with files that still exist.
 */
export const DocumentDiscoveryManager = {
  /**
   * Run full device discovery across all platform-accessible sources.
   * Documents are stored as references (no file copy).
   */
  async discoverAll(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const {
      sources,
      includeImages,
      validateSignatures: doValidation = false,
      onProgress,
      signal,
    } = options;

    const result: DiscoveryResult = { found: [], imported: 0, updated: 0, skipped: 0 };
    const scannedUris = new Set<string>();

    const indexOne = async (item: DiscoveredDocument) => {
      if (signal?.aborted) return;
      if (scannedUris.has(item.uri)) return;
      scannedUris.add(item.uri);

      if (doValidation) {
        const valid = await validateSignature(item.uri, item.extension);
        if (!valid) { result.skipped++; return; }
      }

      const doc = await this.index(item);
      if (doc) {
        result.imported++;
        if (doc.addedAt !== doc.createdAt) result.updated++;
      }
      result.found.push(item);
    };

    // Android: MediaStore + filesystem scan
    if (Platform.OS === 'android') {
      const shouldScan = !sources || sources.includes('mediastore');
      const shouldScanFS = !sources || sources.includes('filesystem');

      if (shouldScan) {
        onProgress?.({ phase: 'scanning', source: 'MediaStore', filesFound: result.found.length, filesImported: result.imported, currentPath: 'MediaStore' });
        const docs = await scanMediaStore({ includeImages, signal });
        for (const item of docs) await indexOne(item);
      }

      if (shouldScanFS) {
        onProgress?.({ phase: 'scanning', source: 'filesystem', filesFound: result.found.length, filesImported: result.imported, currentPath: 'Device storage' });
        const docs = await scanCommonDirectories({
          signal,
          onProgress: (path, count) => {
            onProgress?.({ phase: 'scanning', source: 'filesystem', filesFound: count, filesImported: result.imported, currentPath: path });
          },
        });
        for (const item of docs) await indexOne(item);
      }
    }

    // iOS / both: rescan connected folder locations
    const shouldScanFolders = !sources || sources.includes('folder');
    if (shouldScanFolders) {
      onProgress?.({ phase: 'scanning', source: 'folders', filesFound: result.found.length, filesImported: result.imported, currentPath: 'Connected folders' });
      const docs = await rescanConnectedLocations();
      for (const item of docs) await indexOne(item);
    }

    // Reconcile: remove DB rows for files that no longer exist
    onProgress?.({ phase: 'indexing', source: 'reconcile', filesFound: result.found.length, filesImported: result.imported, currentPath: 'Reconciling...' });
    const reconcile = await this.reconcile({ scannedSources: sources });
    result.updated += reconcile.updated;

    return result;
  },

  /**
   * Index a single DiscoveredDocument into the database as a reference.
   */
  async index(item: DiscoveredDocument): Promise<Document | null> {
    if (!isSupportedExtension(item.name)) return null;

    const importOpts: ImportOptions = {
      source: item.source,
      copyLocal: false,
      mimeType: item.mimeType || null,
      size: item.size,
      modifiedAt: item.modifiedAt != null ? new Date(item.modifiedAt).toISOString() : undefined,
    };
    return importFile(item.uri, item.name, item.mimeType || null, importOpts);
  },

  /**
   * Pick a folder (platform picker) and scan all documents inside it.
   */
  async scanFolder(onProgress?: (p: DiscoveryProgress) => void): Promise<number> {
    onProgress?.({ phase: 'permissions', source: 'folder', filesFound: 0, filesImported: 0, currentPath: 'Picking folder...' });
    const items = await pickAndScanFolder();
    let imported = 0;
    for (const item of items) {
      const doc = await this.index(item);
      if (doc) imported++;
      onProgress?.({ phase: 'scanning', source: 'folder', filesFound: items.length, filesImported: imported, currentPath: item.name });
    }
    return imported;
  },

  /**
   * Scan a specific path (Android only via native module).
   */
  async scanCustomPath(path: string, onProgress?: (p: DiscoveryProgress) => void): Promise<number> {
    if (Platform.OS !== 'android') return 0;
    onProgress?.({ phase: 'scanning', source: 'filesystem', filesFound: 0, filesImported: 0, currentPath: path });
    const items = await scanPath(path, {
      onProgress: (currentPath, filesFound) => {
        onProgress?.({ phase: 'scanning', source: 'filesystem', filesFound, filesImported: 0, currentPath });
      },
    });
    let imported = 0;
    for (const item of items) {
      const doc = await this.index(item);
      if (doc) imported++;
    }
    return imported;
  },

  /** Request platform-appropriate storage permissions. */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const mediaStore = await ensureMediaStorePermissions();
      const filesystem = await requestFilesystemPermission();
      return mediaStore || filesystem;
    }
    return true; // iOS doesn't need special permissions; folder picker handles it
  },

  /** Check whether storage permissions are already granted. */
  async hasPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const mediaStore = await hasMediaStorePermissions();
      const filesystem = await hasFilesystemPermission();
      return mediaStore || filesystem;
    }
    return true;
  },

  /**
   * Reconcile the document index against the filesystem.
   * Removes documents whose source files no longer exist.
   * Updates metadata (size, modified) for files that changed.
   */
  async reconcile(options?: { scannedSources?: DocumentSource[] }): Promise<ReconcileResult> {
    const result: ReconcileResult = { removed: 0, unavailable: 0, updated: 0 };
    const db = await getDb();
    const allDocs = await getAllDocuments(db);

    for (const doc of allDocs) {
      const source = (doc as any).source as DocumentSource | undefined;
      if (options?.scannedSources && source && !options.scannedSources.includes(source)) continue;

      try {
        const file = new File(doc.path);
        const info = file.info();
        if (!info.exists) {
          await deleteDocument(db, doc.id);
          try { await deleteDocumentContent(db, doc.id); } catch {}
          result.removed++;
          continue;
        }
        if (info.size !== doc.size || (info.modificationTime && info.modificationTime > 0)) {
          const updates: Partial<Document> = {};
          if (info.size !== doc.size) updates.size = info.size;
          if (info.modificationTime && doc.modifiedAt) {
            const docModTime = new Date(doc.modifiedAt).getTime();
            if (Math.abs(info.modificationTime - docModTime) > 1000) {
              updates.modifiedAt = new Date(info.modificationTime).toISOString();
            }
          }
          if (Object.keys(updates).length > 0) {
            const { updateDocument } = await import('@/db/documents');
            await updateDocument(db, doc.id, updates);
            result.updated++;
          }
        }
      } catch {
        result.unavailable++;
      }
    }

    return result;
  },

  /**
   * Handle a MediaStore change event (added, removed, modified).
   */
  async handleMediaChange(event: MediaChangeEvent): Promise<boolean> {
    const db = await getDb();
    if (event.type === 'added') {
      if (event.mediaType !== 'document' && event.mediaType !== 'image') return false;
      const item = await lookupMediaStoreItem(event.uri);
      if (!item) return false;
      const doc = await getDocumentByPath(db, event.uri);
      if (doc) return false;
      const imported = await this.index(item);
      return !!imported;
    }
    if (event.type === 'removed') {
      const doc = await getDocumentByPath(db, event.uri);
      if (!doc) return false;
      await deleteDocument(db, doc.id);
      try { await deleteDocumentContent(db, doc.id); } catch {}
      return true;
    }
    if (event.type === 'modified') {
      const doc = await getDocumentByPath(db, event.uri);
      if (!doc) return false;
      try {
        const file = new File(event.uri);
        const info = file.info();
        if (info.exists) {
          const { updateDocument } = await import('@/db/documents');
          const updates: Partial<Document> = {};
          if (info.size !== doc.size) updates.size = info.size;
          if (Object.keys(updates).length > 0) await updateDocument(db, doc.id, updates);
        }
      } catch {}
      return true;
    }
    return false;
  },
};
