import type { SQLiteDatabase } from 'expo-sqlite';
import { extractTextFromDocument } from '@/services/content-extractor';
import { ensureLocalUri } from '@/services/uri-resolver';
import type { DocumentType } from '@/types';

export interface ContentSearchResult {
  documentId: string;
  documentName: string;
  documentType: string;
  snippet: string;
  rank: number;
  matchType: 'name' | 'content';
}

export async function indexDocumentContent(
  db: SQLiteDatabase,
  documentId: string,
  path: string,
  type: DocumentType,
): Promise<void> {
  const localPath = await ensureLocalUri(path, documentId);
  const content = await extractTextFromDocument(localPath, type);
  if (!content.trim()) return;

  const existing = await db.getFirstAsync<{ document_id: string }>(
    'SELECT document_id FROM document_content WHERE document_id = ?',
    documentId,
  );

  if (existing) {
    await db.runAsync(
      'UPDATE document_content SET content = ?, indexed_at = datetime("now") WHERE document_id = ?',
      content,
      documentId,
    );
  } else {
    await db.runAsync(
      'INSERT INTO document_content (document_id, content, indexed_at) VALUES (?, ?, datetime("now"))',
      documentId,
      content,
    );
  }
}

export async function deleteDocumentContent(
  db: SQLiteDatabase,
  documentId: string,
): Promise<void> {
  await db.runAsync('DELETE FROM document_content WHERE document_id = ?', documentId);
}

export async function reindexAllContent(db: SQLiteDatabase): Promise<void> {
  const docs = await db.getAllAsync<{ id: string; path: string; type: DocumentType }>(
    "SELECT id, path, type FROM documents WHERE type IN ('epub', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'code')",
  );

  for (const doc of docs) {
    try {
      const localPath = await ensureLocalUri(doc.path, doc.id);
      const content = await extractTextFromDocument(localPath, doc.type);
      if (!content.trim()) continue;

      const existing = await db.getFirstAsync<{ document_id: string }>(
        'SELECT document_id FROM document_content WHERE document_id = ?',
        doc.id,
      );

      if (existing) {
        await db.runAsync(
          'UPDATE document_content SET content = ?, indexed_at = datetime("now") WHERE document_id = ?',
          content,
          doc.id,
        );
      } else {
        await db.runAsync(
          'INSERT INTO document_content (document_id, content, indexed_at) VALUES (?, ?, datetime("now"))',
          doc.id,
          content,
        );
      }
    } catch {
      // skip failed documents
    }
  }
}

export async function getDocumentContent(
  db: SQLiteDatabase,
  documentId: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ content: string }>(
    'SELECT content FROM document_content WHERE document_id = ?',
    documentId,
  );
  return row?.content ?? null;
}

export async function searchContent(
  db: SQLiteDatabase,
  query: string,
): Promise<ContentSearchResult[]> {
  if (!query.trim()) return [];
  const term = `${query}*`;

  return db.getAllAsync<ContentSearchResult>(
    `SELECT d.id as documentId, d.name as documentName, d.type as documentType,
            snippet(content_fts, 0, '<mark>', '</mark>', '...', 30) as snippet,
            rank, 'content' as matchType
     FROM document_content dc
     JOIN content_fts ON dc.rowid = content_fts.rowid
     JOIN documents d ON d.id = dc.document_id
     WHERE content_fts MATCH ?
     UNION
     SELECT d.id as documentId, d.name as documentName, d.type as documentType,
            d.name as snippet, rank, 'name' as matchType
     FROM documents d
     JOIN documents_fts fts ON d.rowid = fts.rowid
     WHERE documents_fts MATCH ?
     ORDER BY rank
     LIMIT 50`,
    term, term,
  );
}
