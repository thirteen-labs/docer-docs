import {
  getDocuments,
  getImages,
  getByUri,
  checkPermissions,
  requestPermissions,
  SortField,
  SortOrder,
  type DocumentItem,
  type ImageItem,
  type MediaChangeEvent,
} from '@obsidian_north/react-native-mediastore';
import { Platform } from 'react-native';
import type { DiscoveredDocument, DocumentSource } from '@/types/discovery';
import { hashString } from '@/utils/hash';
import { getExtension, getClassification } from '@/services/discovery/registry';

/**
 * Android MediaStore scanner.
 *
 * MediaStore is the system-level SQLite index of user media, so a scan is
 * near-instant and needs no recursive filesystem walk. It covers internal
 * shared storage, Downloads, Documents, DCIM, Pictures, WhatsApp, Telegram,
 * and every other directory the platform has indexed.
 */
const MEDIASTORE_SOURCE: DocumentSource = 'mediastore';

function itemName(item: DocumentItem | ImageItem): string {
  if ('name' in item && item.name) return item.name;
  if ('displayName' in item && item.displayName) return item.displayName;
  if ('title' in item && item.title) {
    const ext = getExtension(item.uri);
    return ext ? `${item.title}.${ext}` : item.title;
  }
  return item.uri.split('/').pop() || 'file';
}

export function toDiscoveredDocument(item: DocumentItem | ImageItem): DiscoveredDocument | null {
  const name = itemName(item);
  const ext = getExtension(name);
  if (!ext) return null;

  const uri = item.uri;
  return {
    id: hashString(uri),
    name,
    uri,
    mimeType: item.mimeType || undefined,
    extension: ext,
    size: item.size || 0,
    modifiedAt: 'dateModified' in item ? item.dateModified : undefined,
    source: MEDIASTORE_SOURCE,
    accessible: true,
    classification: getClassification(name),
  };
}

export async function ensureMediaStorePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await checkPermissions();
    if (status.granted) return true;
    const result = await requestPermissions();
    return result.granted;
  } catch {
    return false;
  }
}

export async function hasMediaStorePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await checkPermissions();
    return status.granted;
  } catch {
    return false;
  }
}

export interface ScanMediaStoreOptions {
  includeImages?: boolean;
  signal?: AbortSignal;
}

/**
 * Returns every discoverable document from MediaStore.
 * Documents are always returned; images only when `includeImages` is true.
 */
export async function scanMediaStore(options: ScanMediaStoreOptions = {}): Promise<DiscoveredDocument[]> {
  if (Platform.OS !== 'android') return [];

  const granted = await ensureMediaStorePermissions();
  if (!granted) return [];

  const sort = { field: SortField.DateAdded, order: SortOrder.Descending };
  const seen = new Set<string>();
  const results: DiscoveredDocument[] = [];

  const push = (item: DocumentItem | ImageItem) => {
    if (options.signal?.aborted) return;
    const doc = toDiscoveredDocument(item);
    if (!doc) return;
    if (seen.has(doc.uri)) return;
    seen.add(doc.uri);
    results.push(doc);
  };

  try {
    const docs = await getDocuments(sort);
    for (const item of docs) push(item);
  } catch {
    // MediaStore query failed — nothing we can index from it.
  }

  if (options.includeImages !== false) {
    try {
      const images = await getImages(sort);
      for (const item of images) push(item);
    } catch {
      // Image queries may be blocked by permission scope; skip gracefully.
    }
  }

  return results;
}

/**
 * Look up a single MediaStore item by its content URI (used for change events).
 */
export async function lookupMediaStoreItem(uri: string): Promise<DiscoveredDocument | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const item = await getByUri(uri);
    if (!item) return null;
    if ('width' in item || item.uri.includes('document')) {
      return toDiscoveredDocument(item as DocumentItem | ImageItem);
    }
    return null;
  } catch {
    return null;
  }
}

export function isMediaStoreChangeEvent(event: MediaChangeEvent): boolean {
  return event.mediaType === 'document' || event.mediaType === 'image';
}
