import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { getDb } from '@/db/connection';
import { getDocumentById, updateDocument, deleteDocument as deleteDocFromDb } from '@/db/documents';

export async function renameDocument(id: string, newName: string): Promise<boolean> {
  try {
    const db = await getDb();
    await updateDocument(db, id, { name: newName });
    return true;
  } catch {
    return false;
  }
}

export async function deleteDocument(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document? This will also remove all associated bookmarks, highlights, and notes.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDb();
              const doc = await getDocumentById(db, id);
              if (doc) {
                await FileSystem.deleteAsync(doc.path, { idempotent: true });
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

export async function duplicateDocument(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return false;

    const baseName = doc.name.replace(/\.[^.]+$/, '');
    const ext = doc.name.includes('.') ? doc.name.substring(doc.name.lastIndexOf('.')) : '';
    const newName = `${baseName} (Copy)${ext}`;
    const dir = doc.path.substring(0, doc.path.lastIndexOf('/'));
    const newPath = `${dir}/${newName}`;

    await FileSystem.copyAsync({ from: doc.path, to: newPath });
    await updateDocument(db, id, { name: newName, path: newPath });
    return true;
  } catch {
    return false;
  }
}

export async function copyDocument(id: string, destinationDir: string): Promise<boolean> {
  try {
    const db = await getDb();
    const doc = await getDocumentById(db, id);
    if (!doc) return false;

    const destPath = `${destinationDir}/${doc.name}`;
    await FileSystem.copyAsync({ from: doc.path, to: destPath });
    return true;
  } catch {
    return false;
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
