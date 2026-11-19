import { World, type Scene, type Tool } from './world.ts';
import type { Layers } from './views';
import { groups } from './tools.ts';

export type Editor = {
  scene: Scene;
  tool: Tool;
  brush: number;
  camera: Layers;
  category: keyof typeof groups;
};
export type Session = { world: World; editor: Editor };
export type Loaded = { session?: Session; warning?: string; writable: boolean };

export function decodeCheckpoint(blob: Uint8Array, metadata: string): Session {
  const { version, editor } = JSON.parse(metadata);
  if (
    version !== 1 ||
    !editor ||
    !['Tunnel', 'Blank'].includes(editor.scene) ||
    !Object.hasOwn(groups, editor.category) ||
    !Object.values(groups)
      .flat()
      .some((t) => t === editor.tool) ||
    ![1, 3, 6].includes(editor.brush) ||
    !['Heat', 'Air', 'Pressure'].every((k) => typeof editor.camera?.[k] === 'boolean')
  )
    throw Error('Unrecognized editor checkpoint');
  return { world: World.restore(blob), editor };
}

export function readSlots(rows: { world: Uint8Array; editor: string }[]): Loaded {
  if (!rows.length) return { writable: true };
  for (const [index, row] of rows.entries()) {
    try {
      const session = decodeCheckpoint(row.world, row.editor);
      return index === 0
        ? { session, writable: true }
        : {
            session,
            writable: false,
            warning: 'Opened the previous world. The newer save is preserved.',
          };
    } catch {
      /* Try the previous committed checkpoint. */
    }
  }
  return {
    writable: false,
    warning: 'This build could not read your saved world. Your save is preserved.',
  };
}

// Both rows are committed together. An interrupted write keeps the previous slot intact.
export function writeSlot(
  db: Pick<import('expo-sqlite').SQLiteDatabase, 'withTransactionSync' | 'runSync' | 'execSync'>,
  { world, editor }: Session,
) {
  const blob = world.snapshot();
  const metadata = JSON.stringify({ version: 1, editor });
  db.withTransactionSync(() => {
    db.runSync('INSERT INTO checkpoints(world,editor) VALUES (?,?)', blob, metadata);
    db.execSync(
      'DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints ORDER BY id DESC LIMIT 2)',
    );
  });
}
