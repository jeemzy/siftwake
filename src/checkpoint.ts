import { World, type Scene, type Tool } from './world.ts';
import type { Layers } from './views';
import { groups } from './tools.ts';
import { M, builtinById } from './materials.ts';

export const defaultHotbar = [M.ClayDust, M.BakingSoda, M.Vinegar, M.Copper, M.Wax, M.Flame] as const;
export const classicHotbar = [M.Sand, M.Water, M.Gravel, M.Smoke, M.Wood, M.Flame] as const;

export type Editor = {
  scene: Scene;
  tool: Tool;
  brush: number;
  camera: Layers;
  category: keyof typeof groups;
  motionEnabled?: boolean;
  hotbar?: (number | null)[];
  thermalPower?: number;
  sourceMode?: boolean;
  probeMode?: boolean;
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
    (editor.motionEnabled !== undefined && typeof editor.motionEnabled !== 'boolean') ||
    (editor.sourceMode !== undefined && typeof editor.sourceMode !== 'boolean') ||
    (editor.probeMode !== undefined && typeof editor.probeMode !== 'boolean') ||
    (editor.thermalPower !== undefined &&
      (!Number.isFinite(editor.thermalPower) || editor.thermalPower < 0 || editor.thermalPower > 100)) ||
    ![1, 3, 6].includes(editor.brush) ||
    !['Heat', 'Air', 'Pressure'].every((k) => typeof editor.camera?.[k] === 'boolean')
  )
    throw Error('Unrecognized editor checkpoint');
  const world = World.restore(blob);
  const knownMaterial = (id: number) => builtinById(id) !== undefined || world.hasCustomMaterial(id);
  if (editor.hotbar !== undefined && (
    !Array.isArray(editor.hotbar) || editor.hotbar.length !== defaultHotbar.length ||
    editor.hotbar.some((id: unknown) => id !== null && (typeof id !== 'number' || !knownMaterial(id)))
  ))
    throw Error('Unrecognized saved hotbar');
  if (
    typeof editor.tool === 'number'
      ? !knownMaterial(editor.tool)
      : !Object.values(groups)
          .flat()
          .some((tool) => tool === editor.tool)
  )
    throw Error('Unrecognized saved tool');
  const worldVersion = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(4);
  if (worldVersion < 3) {
    editor.hotbar ??= [...classicHotbar];
    editor.thermalPower ??= 100;
    editor.sourceMode ??= false;
  }
  // Earlier builds allowed the inspect-only tool to follow the player onto other tabs.
  // Restore the selected tab with a paintable tool, preserving the player's slot bindings.
  if (editor.tool === 'Probe') {
    if (editor.category === 'Thermal') {
      editor.probeMode = true;
    } else {
      editor.tool = editor.hotbar?.find((id: number | null) => id !== null) ?? classicHotbar[0];
      editor.probeMode = false;
    }
    editor.sourceMode = false;
  } else if (editor.probeMode && (editor.category !== 'Thermal' ||
    (editor.tool !== 'Heat' && editor.tool !== 'Cool'))) {
    editor.probeMode = false;
  }
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
