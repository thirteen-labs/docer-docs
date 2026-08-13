import { File, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { importFile } from '@/services/import-service';
import { scanDeviceDocuments } from '@/services/mediastore-service';
import DocumentScannerModule, {
  type ScannedDocument,
} from '@/document-scanner';
import { isSupportedExtension, SUPPORTED_EXTENSIONS } from '@/services/discovery/registry';

export interface ScanProgress {
  filesFound: number;
  filesImported: number;
  currentPath: string | null;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

function isSupportedFile(file: File): boolean {
  return isSupportedExtension(file.name);
}

async function scanDirectory(
  directory: Directory,
  onProgress?: ScanProgressCallback
): Promise<number> {
  let imported = 0;
  let filesFound = 0;
  try {
    const entries = directory.list();
    for (const entry of entries) {
      if (entry instanceof File) {
        if (isSupportedFile(entry)) {
          filesFound++;
          const doc = await importFile(entry.uri, entry.name, null, { source: 'filesystem' });
          if (doc) imported++;
          onProgress?.({
            filesFound,
            filesImported: imported,
            currentPath: entry.uri,
          });
        }
      } else if (entry instanceof Directory) {
        if (!entry.name.startsWith('.')) {
          imported += await scanDirectory(entry, onProgress);
        }
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return imported;
}

function getRootDirectory(): Directory {
  if (Platform.OS === 'android') {
    try {
      return new Directory('file:///storage/emulated/0/');
    } catch {
      return Paths.document;
    }
  }
  return Paths.document;
}

async function scanRootDirectory(
  onProgress?: ScanProgressCallback
): Promise<number> {
  return scanDirectory(getRootDirectory(), onProgress);
}

async function scanWithNativeModule(
  onProgress?: ScanProgressCallback
): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  try {
    const hasPermission = await DocumentScannerModule.hasStoragePermission();
    if (!hasPermission) return 0;

    const dirs = await DocumentScannerModule.getCommonDocumentDirs();
    const allDocs: ScannedDocument[] = [];

    for (const dir of dirs) {
      try {
        onProgress?.({
          filesFound: allDocs.length,
          filesImported: 0,
          currentPath: dir.name,
        });
        const docs = await DocumentScannerModule.scanDirectory(
          dir.path,
          Array.from(SUPPORTED_EXTENSIONS)
        );
        allDocs.push(...docs);
      } catch {
        // skip inaccessible directories
      }
    }

    let imported = 0;
    for (const doc of allDocs) {
      const result = await importFile(doc.uri, doc.name, null, { source: 'filesystem' });
      if (result) imported++;
      onProgress?.({
        filesFound: allDocs.length,
        filesImported: imported,
        currentPath: doc.name,
      });
    }

    return imported;
  } catch {
    return 0;
  }
}

export async function autoFetchOnLaunch(
  onProgress?: ScanProgressCallback
): Promise<number> {
  let total = 0;

  onProgress?.({
    filesFound: 0,
    filesImported: 0,
    currentPath: 'MediaStore',
  });
  const mediaStoreCount = await scanDeviceDocuments();
  total += mediaStoreCount;

  onProgress?.({
    filesFound: mediaStoreCount,
    filesImported: total,
    currentPath: 'Device storage',
  });
  const nativeCount = await scanWithNativeModule(onProgress);
  total += nativeCount;

  onProgress?.({
    filesFound: total,
    filesImported: total,
    currentPath: 'File system',
  });
  const rootCount = await scanRootDirectory(onProgress);
  total += rootCount;

  return total;
}

export async function scanWithPicker(): Promise<number> {
  try {
    const directory = await Directory.pickDirectoryAsync();
    if (directory) {
      return scanDirectory(directory);
    }
  } catch {}
  return 0;
}

export async function requestFilePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return DocumentScannerModule.requestStoragePermission();
}

export async function hasFilePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return DocumentScannerModule.hasStoragePermission();
}

export async function scanCustomPath(
  path: string,
  onProgress?: ScanProgressCallback
): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  try {
    onProgress?.({
      filesFound: 0,
      filesImported: 0,
      currentPath: path,
    });

    const docs = await DocumentScannerModule.scanDirectory(
      path,
      Array.from(SUPPORTED_EXTENSIONS)
    );

    onProgress?.({
      filesFound: docs.length,
      filesImported: 0,
      currentPath: path,
    });

    let imported = 0;
    for (const doc of docs) {
      const result = await importFile(doc.uri, doc.name, null, { source: 'filesystem' });
      if (result) imported++;
      onProgress?.({
        filesFound: docs.length,
        filesImported: imported,
        currentPath: doc.name,
      });
    }

    return imported;
  } catch {
    return 0;
  }
}
