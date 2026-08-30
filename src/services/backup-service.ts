import { File, Directory, Paths } from 'expo-file-system';

const BACKUP_DIR_NAME = 'omnidoc-backups';

async function getBackupDir(): Promise<Directory | null> {
  const dir = new Directory(Paths.cache, BACKUP_DIR_NAME);
  await dir.create({ intermediates: true });
  return dir;
}

export async function createBackup(): Promise<string | null> {
  try {
    const backupDir = await getBackupDir();
    if (!backupDir) return null;

    const dbDir = new Directory(Paths.document, 'SQLite');
    const dbFile = new File(dbDir, 'omnidoc.db');
    if (!(await dbFile.exists)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = new File(backupDir, `omnidoc-backup-${timestamp}.db`);
    await dbFile.copy(backupFile);
    return backupFile.uri;
  } catch {
    return null;
  }
}

export async function shareBackup(backupPath: string): Promise<void> {
  const { shareAsync } = await import('expo-sharing');
  await shareAsync(backupPath);
}

export async function getBackupList(): Promise<{ name: string; size: number; date: string }[]> {
  try {
    const backupDir = await getBackupDir();
    if (!backupDir) return [];

    const entries = await backupDir.list();
    const results: { name: string; size: number; date: string }[] = [];

    for (const entry of entries) {
      if (entry instanceof File && entry.extension === '.db') {
        const info = await entry.info();
        results.push({
          name: entry.name,
          size: info.size ?? 0,
          date: entry.name.replace('omnidoc-backup-', '').replace('.db', ''),
        });
      }
    }
    return results.sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}
