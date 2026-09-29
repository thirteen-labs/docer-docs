import { useCallback, useEffect, useRef } from 'react';

import { getDb } from '@/db/connection';
import { upsertHistory } from '@/db/history';
import { addDocumentOpened, addPagesRead, addReadingTime } from '@/db/stats';

/** Flush at most this often while the reader is open (ms). */
const WRITE_INTERVAL_MS = 5000;
/** Ignore sessions shorter than this when adding to the reading total (s). */
const MIN_SESSION_SECONDS = 5;

interface UseReadingProgressOptions {
  documentId: string | undefined;
  /** Current page/chapter index. */
  page: number;
  /** Total pages/chapters. Use 0 when the document is not paginated. */
  total: number;
  /**
   * 0..1 completion for non-paginated documents, where position comes from
   * scroll rather than a page number. Takes precedence over page/total.
   */
  progressRatio?: number;
  /** Set false for previews and other throwaway views that should not count. */
  enabled?: boolean;
}

/**
 * Persists reading position for a reader screen.
 *
 * Handles the bookkeeping every reader was repeating inline: writes are
 * throttled, the session is flushed on unmount/background so time is not lost,
 * and failures are logged rather than surfacing as unhandled rejections.
 *
 * Also feeds the daily `reading_stats` row that the Stats screen and reading
 * goals read from. Position is held in a ref so that turning a page does not
 * tear down and restart the session timer.
 */
export function useReadingProgress({ documentId, page, total, progressRatio, enabled = true }: UseReadingProgressOptions) {
  const positionRef = useRef({ page, total, progressRatio });
  const sessionStartRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const lastWriteRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountedPageRef = useRef(page);

  // Keep the latest position for the throttled flush to read, without making
  // `flush` change identity on every page turn (which would restart the session).
  useEffect(() => {
    positionRef.current = { page, total, progressRatio };
  }, [page, total, progressRatio]);

  const flush = useCallback(async () => {
    if (!documentId) return;
    if (sessionStartRef.current === null) sessionStartRef.current = Date.now();

    const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
    if (elapsed < MIN_SESSION_SECONDS) return;

    const { page: currentPage, total: currentTotal, progressRatio: ratio } = positionRef.current;
    // Count forward movement only, so scrolling back and forth does not
    // inflate the pages-read total.
    const pagesAdvanced = Math.max(0, currentPage - lastCountedPageRef.current);
    lastCountedPageRef.current = currentPage;

    pendingRef.current = false;
    lastWriteRef.current = Date.now();
    sessionStartRef.current = Date.now();

    const progress =
      typeof ratio === 'number'
        ? Math.min(1, Math.max(0, ratio))
        : currentTotal > 0
          ? currentPage / currentTotal
          : 1;

    const db = await getDb();
    await upsertHistory(db, {
      documentId,
      lastPage: currentPage,
      progress,
      readingTimeDelta: elapsed,
    });
    await addReadingTime(db, elapsed);
    if (pagesAdvanced > 0) await addPagesRead(db, pagesAdvanced);
  }, [documentId]);

  const schedule = useCallback(() => {
    if (!enabled || !documentId) return;
    if (pendingRef.current) return;
    pendingRef.current = true;

    const delay = Math.max(0, WRITE_INTERVAL_MS - (Date.now() - lastWriteRef.current));
    timerRef.current = setTimeout(() => {
      void flush().catch((e) => console.warn('[useReadingProgress] flush failed', e));
    }, delay);
  }, [enabled, documentId, flush]);

  // Start a session: depends only on identity, not on the current page.
  useEffect(() => {
    if (!enabled || !documentId) return;
    sessionStartRef.current = Date.now();
    lastWriteRef.current = 0;
    lastCountedPageRef.current = positionRef.current.page;

    void getDb()
      .then((db) => addDocumentOpened(db))
      .catch((e) => console.warn('[useReadingProgress] open tracking failed', e));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Flush before the next session starts so time is never dropped.
      void flush().catch(() => {});
    };
  }, [enabled, documentId, flush]);

  useEffect(() => {
    if (!enabled || !documentId) return;
    schedule();
  }, [page, progressRatio, enabled, documentId, schedule]);
}
