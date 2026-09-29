import type { SQLiteDatabase } from 'expo-sqlite';

/** Local calendar day, matching the `date` values stored in reading_stats. */
function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getTodayStats(db: SQLiteDatabase): Promise<{ pagesRead: number; readingTime: number; documentsOpened: number }> {
  const row = await db.getFirstAsync<{ pages_read: number; reading_time: number; documents_opened: number }>(
    'SELECT pages_read, reading_time, documents_opened FROM reading_stats WHERE date = ?', todayKey()
  );
  return { pagesRead: row?.pages_read ?? 0, readingTime: row?.reading_time ?? 0, documentsOpened: row?.documents_opened ?? 0 };
}

const STATS_COLUMNS = ['pages_read', 'reading_time', 'documents_opened'] as const;
type StatsColumn = (typeof STATS_COLUMNS)[number];

/**
 * Adds to today's counters rather than replacing them.
 *
 * The readers flush from timers and unmount handlers that can overlap, so a
 * read-modify-write would lose updates. Doing the arithmetic inside the UPSERT
 * keeps concurrent increments safe.
 *
 * The seed value matters: on a first write there is no conflict, so the INSERT
 * branch is what actually records the amount. Seeding zeros there would drop
 * the opening increment of every session.
 */
async function incrementToday(db: SQLiteDatabase, column: StatsColumn, amount: number): Promise<void> {
  const safeAmount = Math.max(0, Math.round(amount));
  if (safeAmount === 0) return;

  const seeds = STATS_COLUMNS.map((c) => (c === column ? safeAmount : 0));
  const today = todayKey();

  await db.runAsync(
    `INSERT INTO reading_stats (id, date, ${STATS_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET ${column} = reading_stats.${column} + excluded.${column}`,
    `stats-${today}`, today, ...seeds
  );
}

export async function addPagesRead(db: SQLiteDatabase, pages: number): Promise<void> {
  await incrementToday(db, 'pages_read', pages);
}

/** `seconds` is the unit stored in reading_time. */
export async function addReadingTime(db: SQLiteDatabase, seconds: number): Promise<void> {
  await incrementToday(db, 'reading_time', seconds);
}

export async function addDocumentOpened(db: SQLiteDatabase): Promise<void> {
  await incrementToday(db, 'documents_opened', 1);
}

/**
 * Overwrites today's counters outright. Only for callers that have already read
 * the current values and intend to set absolute totals (e.g. the manual timer).
 */
export async function upsertTodayStats(db: SQLiteDatabase, stats: { pagesRead: number; readingTime: number; documentsOpened: number }): Promise<void> {
  const today = todayKey();
  await db.runAsync(
    `INSERT INTO reading_stats (id, date, pages_read, reading_time, documents_opened)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       pages_read = excluded.pages_read,
       reading_time = excluded.reading_time,
       documents_opened = excluded.documents_opened`,
    `stats-${today}`, today, stats.pagesRead, stats.readingTime, stats.documentsOpened
  );
}

export async function getDateRangeStats(db: SQLiteDatabase, from: string, to: string) {
  return db.getAllAsync(
    'SELECT * FROM reading_stats WHERE date >= ? AND date <= ? ORDER BY date ASC', from, to
  );
}

/**
 * Whole days from `a` to `b`, immune to timezone and DST drift.
 *
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, so subtracting two of them
 * in a non-UTC zone yields fractional days and an exact `=== 1` comparison
 * never matches. Working in epoch-millisecond UTC avoids that.
 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000
  );
}

export async function getReadingStreak(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM reading_stats WHERE pages_read > 0 OR reading_time > 0 ORDER BY date DESC'
  );
  if (rows.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < rows.length; i++) {
    // rows are newest first, so rows[i - 1] is the later date and the gap is +1.
    if (daysBetween(rows[i].date, rows[i - 1].date) === 1) streak++;
    else break;
  }
  return streak;
}
