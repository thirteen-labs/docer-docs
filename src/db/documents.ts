import type { SQLiteDatabase } from 'expo-sqlite';
import type { Document, SortBy, SortOrder } from '@/types';

const DOC_COLUMNS = `id, name, path, type, mime_type AS mimeType, size, page_count AS pageCount, author, created_at AS createdAt, modified_at AS modifiedAt, added_at AS addedAt, metadata, thumbnail_path AS thumbnailPath, is_hidden AS isHidden, source`;

/**
 * Table-qualifies DOC_COLUMNS for use in a multi-table query. Queries joining
 * `documents` against `reading_history` or `documents_fts` must qualify, since
 * both of those tables also expose `id`, and `documents_fts` exposes `name` and
 * `author` — SQLite rejects the unqualified form as ambiguous.
 */
function qualifiedColumns(alias: string): string {
  return DOC_COLUMNS.split(',')
    .map((part) => {
      const tokens = part.trim().split(/\s+/);
      // Preserve "col AS alias"; only the source column gets qualified.
      return tokens.length === 3 && tokens[1].toUpperCase() === 'AS'
        ? `${alias}.${tokens[0]} AS ${tokens[2]}`
        : `${alias}.${tokens.join(' ')}`;
    })
    .join(', ');
}

export interface DocumentQueryOptions {
  category?: string | null;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

function categoryWhere(category?: string | null): { clause: string; params: (string | number)[] } {
  if (!category) return { clause: '', params: [] };
  const types = CATEGORY_TYPE_MAP[category];
  if (!types) return { clause: 'WHERE type = ?', params: [category] };
  if (category === 'other') {
    const known = Object.values(CATEGORY_TYPE_MAP).flat().filter((t) => t !== 'unknown');
    const ph = known.map(() => '?').join(',');
    return { clause: `WHERE type NOT IN (${ph})`, params: known };
  }
  const ph = types.map(() => '?').join(',');
  return { clause: `WHERE type IN (${ph})`, params: types };
}

function orderClause(sortBy?: SortBy, sortOrder?: SortOrder): string {
  const dir = sortOrder === 'asc' ? 'ASC' : 'DESC';
  switch (sortBy) {
    case 'name': return `ORDER BY name COLLATE NOCASE ${dir}`;
    case 'type': return `ORDER BY type ${dir}, name COLLATE NOCASE ASC`;
    case 'size': return `ORDER BY size ${dir}`;
    case 'date':
    default: return `ORDER BY added_at ${dir}`;
  }
}

async function queryDocuments(db: SQLiteDatabase, opts: DocumentQueryOptions): Promise<Document[]> {
  const { clause, params } = categoryWhere(opts.category);
  let sql = `SELECT ${DOC_COLUMNS} FROM documents ${clause} ${orderClause(opts.sortBy, opts.sortOrder)}`;
  if (opts.limit != null) sql += ` LIMIT ${opts.limit}`;
  if (opts.offset != null) sql += ` OFFSET ${opts.offset}`;
  return db.getAllAsync<Document>(sql, ...params);
}

export async function getAllDocuments(db: SQLiteDatabase, opts?: DocumentQueryOptions): Promise<Document[]> {
  return queryDocuments(db, opts ?? {});
}

export async function getDocumentsTotal(db: SQLiteDatabase, category?: string | null): Promise<number> {
  const { clause, params } = categoryWhere(category ?? null);
  // Hidden documents are excluded everywhere else in the UI; counting them here
  // made the header and the Explore "All" filter disagree with the library list.
  const where = clause ? `${clause} AND is_hidden = 0` : 'WHERE is_hidden = 0';
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM documents ${where}`, ...params);
  return row?.c ?? 0;
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

const CATEGORY_TYPE_MAP: Record<string, string[]> = {
  pdf: ['pdf'],
  epub: ['epub'],
  office: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'rtf'],
  image: ['image'],
  archive: ['archive'],
  text: ['txt', 'md', 'code'],
  code: ['code', 'txt', 'md'],
  other: ['unknown'],
};

export async function getDocumentsByCategory(
  db: SQLiteDatabase,
  category: string,
  opts?: Omit<DocumentQueryOptions, 'category'>,
): Promise<Document[]> {
  return queryDocuments(db, { ...(opts ?? {}), category });
}

const CATEGORY_CASE_SQL = `CASE
      WHEN type IN ('pdf') THEN 'pdf'
      WHEN type IN ('epub') THEN 'epub'
      WHEN type IN ('doc','docx','xls','xlsx','ppt','pptx','csv','rtf') THEN 'office'
      WHEN type = 'image' THEN 'image'
      WHEN type = 'archive' THEN 'archive'
      WHEN type IN ('txt','md','code') THEN 'text'
      ELSE 'other' END`;

export async function getCategoryCounts(db: SQLiteDatabase): Promise<{ type: string; count: number }[]> {
  // Group by the CASE result, not the raw column: grouping by `type` resolves to
  // the underlying column, so 'doc' and 'docx' would each return a separate
  // "office" row and the library would show split counts and duplicate chips.
  return db.getAllAsync<{ type: string; count: number }>(
    `SELECT ${CATEGORY_CASE_SQL} AS type, COUNT(*) as count
     FROM documents WHERE is_hidden = 0 GROUP BY 1`
  );
}

export async function searchDocuments(db: SQLiteDatabase, query: string): Promise<Document[]> {
  return db.getAllAsync<Document>(
    `SELECT ${qualifiedColumns('doc')} FROM documents doc
     JOIN documents_fts fts ON doc.rowid = fts.rowid WHERE documents_fts MATCH ? ORDER BY rank`,
    `${query}*`
  );
}

export async function getRecentDocuments(db: SQLiteDatabase, limit = 20): Promise<(Document & { lastReadAt: string; progress: number })[]> {
  return db.getAllAsync(
    `SELECT ${qualifiedColumns('d')}, rh.last_read_at AS lastReadAt, rh.progress FROM documents d
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
