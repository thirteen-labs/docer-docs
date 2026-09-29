import { File } from 'expo-file-system';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import type { Document } from '@/types';
import { ensureLocalUri } from '@/services/uri-resolver';

export async function resolveDocumentUri(doc: Document): Promise<string> {
  return ensureLocalUri(doc.path, doc.name);
}

export async function loadDocument(id: string): Promise<{ doc: Document | null; content: string | null; resolvedUri?: string }> {
  const db = await getDb();
  const doc = await getDocumentById(db, id);
  if (!doc) return { doc: null, content: null };

  try {
    const resolved = await ensureLocalUri(doc.path, doc.name);
    const file = new File(resolved);
    const info = file.info();
    const MAX_TEXT_READ = 2 * 1024 * 1024;
    let text: string;
    if ((info.size ?? 0) > MAX_TEXT_READ) {
      const { FileMode } = await import('expo-file-system');
      const handle = file.open(FileMode.ReadOnly);
      try {
        const bytes = handle.readBytes(MAX_TEXT_READ);
        text = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(bytes) : '');
      } finally {
        handle.close();
      }
      text += '\n\n[… file truncated for preview …]';
    } else {
      text = await file.text();
    }
    return { doc, content: text, resolvedUri: resolved };
  } catch {
    return { doc, content: null };
  }
}

export async function loadDocumentUri(id: string): Promise<{ doc: Document | null; uri: string | null; resolvedUri: string | null }> {
  const db = await getDb();
  const doc = await getDocumentById(db, id);
  if (!doc) return { doc: null, uri: null, resolvedUri: null };
  const resolved = await ensureLocalUri(doc.path, doc.name);
  return { doc, uri: doc.path, resolvedUri: resolved };
}
