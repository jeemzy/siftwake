import { encodeCheckpoint, readSlots, type Loaded, type Session } from './checkpoint';

const key = 'siftwake.world';
type StoredSlot = { world: string; editor: string };

function slots(): StoredSlot[] {
  const rows = JSON.parse(localStorage.getItem(key) ?? '[]');
  if (!Array.isArray(rows)) throw Error('Unreadable browser storage');
  return rows.slice(0, 2);
}

export function loadSession(): Loaded {
  try {
    return readSlots(
      slots().map((row) => {
        try {
          return {
            world: Uint8Array.from(atob(row.world), (c) => c.charCodeAt(0)),
            editor: row.editor,
          };
        } catch {
          return { world: new Uint8Array(), editor: '' };
        }
      }),
    );
  } catch {
    return {
      writable: false,
      warning: 'Browser storage could not be read. Your existing save is preserved.',
    };
  }
}

export function saveSession(session: Session) {
  const { world, editor } = encodeCheckpoint(session);
  let binary = '';
  for (let offset = 0; offset < world.length; offset += 8192)
    binary += String.fromCharCode(...world.subarray(offset, offset + 8192));
  localStorage.setItem(
    key,
    JSON.stringify([{ world: btoa(binary), editor }, ...slots().slice(0, 1)]),
  );
}
