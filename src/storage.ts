import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { readSlots, type Loaded, type Session } from './checkpoint';
let db: SQLiteDatabase | null = null;
export const persists = true;
export function loadSession(): Loaded {
  try {
    db = openDatabaseSync('siftwake-world.db');
    db.execSync(
      'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS checkpoints (id INTEGER PRIMARY KEY, world BLOB NOT NULL, editor TEXT NOT NULL)',
    );
    return readSlots(
      db.getAllSync('SELECT world, editor FROM checkpoints ORDER BY id DESC LIMIT 2'),
    );
  } catch {
    return {
      writable: false,
      warning: 'World storage is unavailable. Your existing save is preserved.',
    };
  }
}
export function saveSession({ world, editor }: Session) {
  if (!db) throw Error('World storage is unavailable');
  const blob = world.snapshot();
  const metadata = JSON.stringify({ version: 1, editor });
  db.withTransactionSync(() => {
    db!.runSync('INSERT INTO checkpoints(world,editor) VALUES (?,?)', blob, metadata);
    db!.execSync(
      'DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints ORDER BY id DESC LIMIT 2)',
    );
  });
}
