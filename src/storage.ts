import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { writeSlot, readSlots, type Loaded, type Session } from './checkpoint';
let db: SQLiteDatabase | null = null;
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
  writeSlot(db, { world, editor });
}
