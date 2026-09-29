import type { SQLiteDatabase } from 'expo-sqlite';

const MIGRATIONS = [
  // v1: Initial schema
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        page_count INTEGER,
        author TEXT,
        created_at TEXT,
        modified_at TEXT,
        added_at TEXT DEFAULT (datetime('now')),
        metadata TEXT,
        thumbnail_path TEXT
      );

      CREATE TABLE IF NOT EXISTS reading_history (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        last_page INTEGER DEFAULT 0,
        last_position TEXT,
        progress REAL DEFAULT 0,
        started_at TEXT,
        last_read_at TEXT,
        read_count INTEGER DEFAULT 0,
        total_reading_time INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        page INTEGER,
        chapter TEXT,
        position TEXT,
        label TEXT,
        folder_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        page INTEGER,
        color TEXT DEFAULT 'yellow',
        text TEXT,
        position TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        page INTEGER,
        paragraph_index INTEGER,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        pinned_to_home INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS collection_documents (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        added_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (collection_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT
      );

      CREATE TABLE IF NOT EXISTS tag_documents (
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        PRIMARY KEY (tag_id, document_id)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        added_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reading_goals (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_value REAL NOT NULL,
        current_value REAL DEFAULT 0,
        period_start TEXT,
        period_end TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reading_stats (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        pages_read INTEGER DEFAULT 0,
        reading_time INTEGER DEFAULT 0,
        documents_opened INTEGER DEFAULT 0
      );
    `);
  },

  // v2: FTS
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        name, author, content='documents', content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, name, author) VALUES (new.rowid, new.name, new.author);
      END;

      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, name, author) VALUES('delete', old.rowid, old.name, old.author);
      END;

      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, name, author) VALUES('delete', old.rowid, old.name, old.author);
        INSERT INTO documents_fts(rowid, name, author) VALUES (new.rowid, new.name, new.author);
      END;
    `);
  },

  // v3: Bookmark folders
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS bookmark_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  },

  // v4: Document content full-text search
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS document_content (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        indexed_at TEXT DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        content, content='document_content', content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS content_ai AFTER INSERT ON document_content BEGIN
        INSERT INTO content_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS content_ad AFTER DELETE ON document_content BEGIN
        INSERT INTO content_fts(content_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS content_au AFTER UPDATE ON document_content BEGIN
        INSERT INTO content_fts(content_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO content_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE INDEX IF NOT EXISTS idx_content_indexed_at ON document_content(indexed_at);
    `);
  },

  // v5: Hidden documents and note encryption support
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      ALTER TABLE documents ADD COLUMN is_hidden INTEGER DEFAULT 0;
      ALTER TABLE notes ADD COLUMN is_encrypted INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_documents_hidden ON documents(is_hidden);
    `);
  },

  // v6: Document source tracking (import vs discovered)
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      ALTER TABLE documents ADD COLUMN source TEXT DEFAULT 'import';
      CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
    `);
  },

  // v7: Reading history upsert support
  // recordProgress relies on ON CONFLICT(document_id), which SQLite rejects
  // unless document_id carries a uniqueness constraint. Without this index every
  // history write threw, so progress and "Continue reading" never updated.
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      DELETE FROM reading_history
      WHERE rowid NOT IN (SELECT MAX(rowid) FROM reading_history GROUP BY document_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_history_document
        ON reading_history(document_id);

      CREATE INDEX IF NOT EXISTS idx_reading_history_last_read_at
        ON reading_history(last_read_at);
    `);
  },

  // v8: Daily stats upsert support
  // The daily counters are accumulated with ON CONFLICT(date) DO UPDATE, which
  // SQLite only accepts when `date` is unique. Previously `date` was unindexed,
  // so concurrent increments could not be expressed safely.
  async (db: SQLiteDatabase) => {
    await db.execAsync(`
      DELETE FROM reading_stats
      WHERE rowid NOT IN (SELECT MIN(rowid) FROM reading_stats GROUP BY date);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_stats_date
        ON reading_stats(date);
    `);
  },
];

const MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`;

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(MIGRATION_TABLE);

  const rows = await db.getAllAsync<{ version: number }>('SELECT version FROM _migrations ORDER BY version');
  const applied = new Set(rows.map(r => r.version));

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (!applied.has(version)) {
      await MIGRATIONS[i](db);
      await db.runAsync('INSERT INTO _migrations (version) VALUES (?)', version);
    }
  }
}
