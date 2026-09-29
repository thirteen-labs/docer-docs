import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { getDb } from '@/db/connection';
import { getDocumentById, updateDocument, deleteDocument as deleteDocFromDb, insertDocument } from '@/db/documents';
import { indexDocumentContent } from '@/db/content-index';
import { resolveDocumentUri } from '@/services/reader-loader';
import type { Document } from '@/types';

async function resolveSourcePath(doc: Document): Promise<string> {
  if (doc.path.startsWith('content://')) {
    return resolveDocumentUri(doc);
  }
  return doc.path;
}

function buildDuplicateDoc(doc: Document, id: string, name: string, path: string): Omit<Document, 'addedAt'> {
  return {
    id,
    name,
    path,
    type: doc.type,
    source: doc.source,
    size: doc.size,
    pageCount: doc.pageCount ?? null,
    author: doc.author ?? null,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    metadata: doc.metadata ?? null,
    thumbnailPath: null,
    isHidden: doc.isHidden ?? false,
    mimeType: doc.mimeType ?? null,
  };
}

export async function renameDocument(id: string, newName: string): Promise<boolean> {
  try {
    const db = await getDb();
    await updateDocument(db, id, { name: newName });
    return true;
  } catch {
    return false;
  }
}

/**
 * Discovered documents are indexed by reference, not copied, so `path` points
 * at a file the user owns outside the app. Only app-owned copies (imports) may
 * be removed from disk.
 */
function isAppOwned(doc: Document): boolean {
  return doc.source === 'import' || doc.source === 'downloaded';
}

export async function deleteDocument(id: string): Promise<boolean> {
  const db = await getDb();
  const doc = await getDocumentById(db, id);
  if (!doc) return false;

  const owned = isAppOwned(doc);
  return new Promise((resolve) => {
    Alert.alert(
      'Delete Document',
      owned
        ? 'This will also remove all associated bookmarks, highlights, and notes.'
        : 'This removes it from your library along with its bookmarks, highlights, and notes. The original file on your device is kept.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              if (owned) {
                await FileSystem.deleteAsync(doc.path, { idempotent: true });
              }
              if (doc.thumbnailPath) {
                await FileSystem.deleteAsync(doc.thumbnailPath, { idempotent: true });
              }
              await deleteDocFromDb(db, id);
              resolve(true);
            } catch { resolve(false); }
          },
        },
      ]
    );
  });
}

export async function shareDocument(id: string): Promise<void> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(doc.path);
    } else {
      Alert.alert('Sharing not available', 'Sharing is not supported on this device.');
    }
  } catch {
    Alert.alert('Error', 'Failed to share document.');
  }
}

export async function duplicateDocument(id: string): Promise<string | null> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return null;

    const baseName = doc.name.replace(/\.[^.]+$/, '');
    const ext = doc.name.includes('.') ? doc.name.substring(doc.name.lastIndexOf('.')) : '';
    const newName = `${baseName} (Copy)${ext}`;

    const sourcePath = await resolveSourcePath(doc);
    const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    const newPath = `${dir}/${newName}`;

    await FileSystem.copyAsync({ from: sourcePath, to: newPath });

    const newId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newDoc = buildDuplicateDoc(doc, newId, newName, newPath);
    await insertDocument(db, newDoc);
    indexDocumentContent(db, newId, newPath, doc.type).catch(() => {});
    return newId;
  } catch {
    return null;
  }
}

export async function copyDocument(id: string, destinationDir: string): Promise<string | null> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return null;

    const sourcePath = await resolveSourcePath(doc);
    const destPath = `${destinationDir.replace(/\/+$/, '')}/${doc.name}`;

    await FileSystem.copyAsync({ from: sourcePath, to: destPath });

    const newId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newDoc = buildDuplicateDoc(doc, newId, doc.name, destPath);
    await insertDocument(db, newDoc);
    indexDocumentContent(db, newId, destPath, doc.type).catch(() => {});
    return newId;
  } catch {
    return null;
  }
}

export async function moveDocument(id: string, destinationDir: string): Promise<boolean> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return false;

    const destPath = `${destinationDir}/${doc.name}`;
    await FileSystem.moveAsync({ from: doc.path, to: destPath });
    await updateDocument(db, id, { path: destPath });
    return true;
  } catch {
    return false;
  }
}
