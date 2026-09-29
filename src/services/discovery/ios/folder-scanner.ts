import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { DiscoveredDocument } from '@/types/discovery';
import { hashString } from '@/utils/hash';
import {
  getExtension,
  getClassification,
  isSupportedExtension,
  isExcludedFile,
} from '@/services/discovery/registry';
import { appStorage } from '@/storage';

/**
 * iOS folder/location scanner.
 *
 * iOS does not allow silent filesystem scanning. Documents are accessed through:
 * - The system folder picker (Directory.pickDirectoryAsync)
 * - Previously connected folder URIs persisted in MMKV
 * - Files imported directly via picker / share sheet
 *
 * Connected folder URIs are persisted so re-scans happen automatically.
 */

function getConnectedLocations(): string[] {
  return appStorage.getConnectedLocations();
}

function addConnectedLocation(uri: string) {
  appStorage.addConnectedLocation(uri);
}

function removeConnectedLocation(uri: string) {
  appStorage.removeConnectedLocation(uri);
}

function toDiscoveredDocument(file: File, folderUri: string): DiscoveredDocument | null {
  const name = file.name;
  if (!isSupportedExtension(name)) return null;
  if (isExcludedFile(name)) return null;

  return {
    id: hashString(file.uri),
    name,
    uri: file.uri,
    extension: getExtension(name),
    size: file.size || 0,
    modifiedAt: file.lastModified || undefined,
    source: 'folder',
    accessible: true,
    classification: getClassification(name),
  };
}

function scanDirectory(dir: Directory): DiscoveredDocument[] {
  const results: DiscoveredDocument[] = [];
  let entries: (File | Directory)[];
  try {
    entries = dir.list();
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry instanceof File) {
      const doc = toDiscoveredDocument(entry, dir.uri);
      if (doc) results.push(doc);
    } else if (entry instanceof Directory) {
      if (!entry.name.startsWith('.')) {
        results.push(...scanDirectory(entry));
      }
    }
  }
  return results;
}

/**
 * Open the system folder picker and scan the selected location.
 * The folder URI is persisted for future re-scans.
 */
export async function pickAndScanFolder(): Promise<DiscoveredDocument[]> {
  if (Platform.OS !== 'android') {
    // iOS: Directory.pickDirectoryAsync uses the Files app
    const directory = await Directory.pickDirectoryAsync();
    if (!directory) return [];
    addConnectedLocation(directory.uri);
    return scanDirectory(directory);
  }
  // Android: same API works via SAF or native directory access
  const directory = await Directory.pickDirectoryAsync();
  if (!directory) return [];
  addConnectedLocation(directory.uri);
  return scanDirectory(directory);
}

/**
 * Re-scan all previously connected folder locations.
 * Removes locations that are no longer accessible.
 */
export async function rescanConnectedLocations(): Promise<DiscoveredDocument[]> {
  const uris = getConnectedLocations();
  const allDocs: DiscoveredDocument[] = [];
  const accessible: string[] = [];

  for (const uri of uris) {
    try {
      const dir = new Directory(uri);
      const info = dir.info();
      if (info.exists) {
        accessible.push(uri);
        allDocs.push(...scanDirectory(dir));
      }
    } catch {
      // Remove inaccessible location
      removeConnectedLocation(uri);
    }
  }

  // Persist only the locations that were successfully scanned
  appStorage.setConnectedLocations(accessible);
  return allDocs;
}
