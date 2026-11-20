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
    ![1, 3, 6].includes(editor.brush) ||
    !['Heat', 'Air', 'Pressure'].every((k) => typeof editor.camera?.[k] === 'boolean')
  )
    throw Error('Unrecognized editor checkpoint');
  const world = World.restore(blob);
  if (
    typeof editor.tool === 'number'
      ? !world.hasCustomMaterial(editor.tool)
      : !Object.values(groups)
          .flat()
          .some((tool) => tool === editor.tool)
  )
    throw Error('Unrecognized saved tool');
  return { world, editor };
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

export function encodeCheckpoint({ world, editor }: Session) {
  return { world: world.snapshot(), editor: JSON.stringify({ version: 1, editor }) };
}

// Insert and prune together so an interrupted write keeps both previous generations.
export function writeSlot(
  db: Pick<import('expo-sqlite').SQLiteDatabase, 'withTransactionSync' | 'runSync' | 'execSync'>,
  session: Session,
) {
  const { world, editor } = encodeCheckpoint(session);
  db.withTransactionSync(() => {
    db.runSync('INSERT INTO checkpoints(world,editor) VALUES (?,?)', world, editor);
    db.execSync(
      'DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints ORDER BY id DESC LIMIT 2)',
    );
  });
}
