import type { SQLiteDatabase } from 'expo-sqlite';
import type { Document } from '@/types';

const DOC_COLUMNS = `id, name, path, type, mime_type AS mimeType, size, page_count AS pageCount, author, created_at AS createdAt, modified_at AS modifiedAt, added_at AS addedAt, metadata, thumbnail_path AS thumbnailPath, is_hidden AS isHidden, source`;

export async function getAllDocuments(db: SQLiteDatabase): Promise<Document[]> {
  return db.getAllAsync<Document>(`SELECT ${DOC_COLUMNS} FROM documents ORDER BY added_at DESC`);
}

export async function getDocumentById(db: SQLiteDatabase, id: string): Promise<Document | null> {
  return db.getFirstAsync<Document>(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = ?`, id);
}

export async function getDocumentByPath(db: SQLiteDatabase, path: string): Promise<Document | null> {
  return db.getFirstAsync<Document>(`SELECT ${DOC_COLUMNS} FROM documents WHERE path = ?`, path);
}

export async function insertDocument(db: SQLiteDatabase, doc: Omit<Document, 'addedAt'>): Promise<void> {
  await db.runAsync(
    `INSERT INTO documents (id, name, path, type, mime_type, size, page_count, author, created_at, modified_at, metadata, thumbnail_path, is_hidden, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    doc.id, doc.name, doc.path, doc.type, doc.mimeType, doc.size, doc.pageCount,
    doc.author, doc.createdAt, doc.modifiedAt,
    doc.metadata ? JSON.stringify(doc.metadata) : null,
    doc.thumbnailPath, doc.isHidden ? 1 : 0,
    doc.source || 'import'
  );
}

export async function updateDocument(db: SQLiteDatabase, id: string, updates: Partial<Document>): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (updates.path !== undefined) { fields.push('path = ?'); values.push(updates.path); }
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
  if (updates.size !== undefined) { fields.push('size = ?'); values.push(updates.size); }
  if (updates.pageCount !== undefined) { fields.push('page_count = ?'); values.push(updates.pageCount); }
  if (updates.author !== undefined) { fields.push('author = ?'); values.push(updates.author); }
  if (updates.modifiedAt !== undefined) { fields.push('modified_at = ?'); values.push(updates.modifiedAt); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }
  if (updates.thumbnailPath !== undefined) { fields.push('thumbnail_path = ?'); values.push(updates.thumbnailPath); }
  if (updates.isHidden !== undefined) { fields.push('is_hidden = ?'); values.push(updates.isHidden ? 1 : 0); }
  if (updates.source !== undefined) { fields.push('source = ?'); values.push(updates.source); }
  if (fields.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, ...values);
}

export async function deleteDocument(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM documents WHERE id = ?', id);
}

export async function getDocumentsByType(db: SQLiteDatabase, type: string): Promise<Document[]> {
  return db.getAllAsync<Document>(`SELECT ${DOC_COLUMNS} FROM documents WHERE type = ? ORDER BY name`, type);
}

export async function getCategoryCounts(db: SQLiteDatabase): Promise<{ type: string; count: number }[]> {
  return db.getAllAsync<{ type: string; count: number }>(
    `SELECT CASE WHEN type IN ('pdf','epub') THEN type
      WHEN type IN ('doc','docx','xls','xlsx','ppt','pptx','csv','rtf') THEN 'office'
      WHEN type IN ('png','jpg','jpeg','gif','webp','bmp','svg') THEN 'image'
      WHEN type IN ('zip','rar','7z','tar') THEN 'archive'
      WHEN type IN ('txt','md','json','xml','html','css','js','ts','jsx','tsx','java','c','cpp','py','php','sql','yaml') THEN 'text'
      ELSE 'other' END AS type, COUNT(*) as count FROM documents GROUP BY type`
  );
}

export async function searchDocuments(db: SQLiteDatabase, query: string): Promise<Document[]> {
  return db.getAllAsync<Document>(
    `SELECT ${DOC_COLUMNS.replace(/^id, /, 'doc.id, ')} FROM documents doc
     JOIN documents_fts fts ON doc.rowid = fts.rowid WHERE documents_fts MATCH ? ORDER BY rank`,
    `${query}*`
  );
}

export async function getRecentDocuments(db: SQLiteDatabase, limit = 20): Promise<(Document & { lastReadAt: string; progress: number })[]> {
  return db.getAllAsync(
    `SELECT ${DOC_COLUMNS}, rh.last_read_at AS lastReadAt, rh.progress FROM documents d
     JOIN reading_history rh ON rh.document_id = d.id
     WHERE d.is_hidden = 0
     ORDER BY rh.last_read_at DESC LIMIT ?`,
    limit
  );
}

export async function toggleDocumentHidden(db: SQLiteDatabase, id: string): Promise<boolean> {
  const doc = await getDocumentById(db, id);
  if (!doc) return false;
  const newHidden = doc.isHidden ? 0 : 1;
  await db.runAsync('UPDATE documents SET is_hidden = ? WHERE id = ?', newHidden, id);
  return !doc.isHidden;
}

export async function getVisibleDocuments(db: SQLiteDatabase): Promise<Document[]> {
  return db.getAllAsync<Document>(`SELECT ${DOC_COLUMNS} FROM documents WHERE is_hidden = 0 ORDER BY added_at DESC`);
}
