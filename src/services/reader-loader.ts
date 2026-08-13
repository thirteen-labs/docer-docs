import { File } from 'expo-file-system';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import type { Document } from '@/types';

export async function loadDocument(id: string): Promise<{ doc: Document | null; content: string | null }> {
  const db = await getDb();
  const doc = await getDocumentById(db, id);
  if (!doc) return { doc: null, content: null };

  try {
    const file = new File(doc.path);
    const text = await file.text();
    return { doc, content: text };
  } catch {
    return { doc, content: null };
  }
}

export async function loadDocumentUri(id: string): Promise<{ doc: Document | null; uri: string | null }> {
  const db = await getDb();
  const doc = await getDocumentById(db, id);
  if (!doc) return { doc: null, uri: null };
  return { doc, uri: doc.path };
}
