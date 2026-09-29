import type { SQLiteDatabase } from 'expo-sqlite';

export interface ReadingHistoryRow {
  id: string;
  document_id: string;
  last_page: number;
  last_position: string | null;
  progress: number;
  started_at: string;
  last_read_at: string;
  read_count: number;
  total_reading_time: number;
}

export async function getHistoryByDocument(db: SQLiteDatabase, documentId: string) {
  return db.getFirstAsync<ReadingHistoryRow>(
    'SELECT * FROM reading_history WHERE document_id = ?',
    documentId
  );
}

/**
 * Records a reading session for a document.
 *
 * One row per document (enforced by idx_reading_history_document). Callers pass
 * only what they know; the rest is derived here so a page turn does not reset
 * the first-read date or the read count:
 *   - `started_at` / `read_count` are set on first insert and left alone after.
 *   - `total_reading_time` accumulates the caller's delta rather than replacing it.
 *   - `progress` and `last_page` track the reader's current position, so
 *     navigating back through a document lowers them again.
 */
export async function upsertHistory(
  db: SQLiteDatabase,
  entry: {
    documentId: string;
    lastPage: number;
    lastPosition?: string | null;
    progress: number;
    /** Seconds to add to the running total for this document. */
    readingTimeDelta?: number;
  }
) {
  const now = new Date().toISOString();
  const progress = Math.min(1, Math.max(0, entry.progress));
  const lastPage = Math.max(0, Math.round(entry.lastPage));
  const delta = Math.max(0, Math.round(entry.readingTimeDelta ?? 0));

  await db.runAsync(
    `INSERT INTO reading_history (
       id, document_id, last_page, last_position, progress,
       started_at, last_read_at, read_count, total_reading_time
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       last_page = excluded.last_page,
       last_position = excluded.last_position,
       progress = excluded.progress,
       last_read_at = excluded.last_read_at,
       total_reading_time = reading_history.total_reading_time + ?`,
    `hist-${entry.documentId}`,
    entry.documentId,
    lastPage,
    entry.lastPosition ?? null,
    progress,
    now,
    now,
    delta,
    delta
  );
}

export async function deleteHistory(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM reading_history WHERE id = ?', id);
}

export async function deleteHistoryByDocument(db: SQLiteDatabase, documentId: string) {
  await db.runAsync('DELETE FROM reading_history WHERE document_id = ?', documentId);
}

export async function clearAllHistory(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM reading_history');
}

export const clearHistory = clearAllHistory;
