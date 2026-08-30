import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('omnidoc.db').then(async (db) => {
      await db.runAsync('PRAGMA foreign_keys = ON;');
      return db;
    });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  const db = await getDb();
  await db.closeAsync();
  dbPromise = null;
}
