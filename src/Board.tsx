import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Canvas, Image, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import StrokeSurface from './StrokeSurface';
import type { Layers } from './views';
import { worldImage } from './pixels';
import { World, W, H, A, tile, type Tool, type ProbeReading } from './world';
import { brushStroke } from './brushStroke';
import type { MotionInput } from './motion';

type Props = {
  world: World;
  paused: boolean;
  locked: React.RefObject<boolean>;
  onStroke: (active: boolean) => void;
  readMotion: () => MotionInput | undefined;
  camera: Layers;
  onProbe: (reading: ProbeReading | null) => void;
  onReading: (value: number) => void;
  tool: Tool;
  brush: number;
  probeMode: boolean;
  sourceMode?: boolean;
  thermalPower?: number;
  agitatePulse?: number;
  inputBlocked?: boolean;
  revision: number;
  sceneName: string;
  report: (message: string) => void;
};

export default function Board({
  world,
  paused,
  locked,
  onStroke,
  readMotion,
  camera,
  onReading,
  onProbe,
  tool,
  brush,
  probeMode,
  sourceMode = false,
  thermalPower = 100,
  agitatePulse = 0,
  inputBlocked = false,
  revision,
  sceneName,
  report,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const width = Math.min(size.width, (size.height * W) / H);
  const [pixels] = useState(() => new Uint8Array(W * H * 4));
  const [frame, setFrame] = useState(() => ({
    image: worldImage(world, camera, pixels),
    tick: world.ticks,
  }));
  const last = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const [stroke] = useState(brushStroke);
  const strokeCallback = useRef(onStroke);
  useLayoutEffect(() => { strokeCallback.current = onStroke; }, [onStroke]);
  const cancelStroke = useCallback(() => {
    stroke.cancel();
    last.current = null;
    if (active.current) {
      active.current = false;
      strokeCallback.current(false);
    }
  }, [stroke]);
  useLayoutEffect(() => {
    return cancelStroke;
  }, [world, paused, tool, brush, probeMode, thermalPower, sourceMode, width, inputBlocked, cancelStroke]);
  const stamp = useCallback((cell: number) => {
    if (tool !== 'Probe') world.paint(tool, cell % W, Math.floor(cell / W), brush, thermalPower);
  }, [world, tool, brush, thermalPower]);
  const previousPulse = useRef(agitatePulse);
  const shakeTicks = useRef(0);
  useLayoutEffect(() => {
    if (paused || inputBlocked || locked.current) shakeTicks.current = 0;
    else if (agitatePulse !== previousPulse.current) shakeTicks.current = 7;
    previousPulse.current = agitatePulse;
  }, [agitatePulse, inputBlocked, paused, locked, world]);
  const lastEdit = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    lastEdit.current = null;
  }, [world]);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const pinRef = useRef(pin);
  const lastProbeTick = useRef(-Infinity);
  const readPin = useCallback(() => {
    const point = pinRef.current;
    if (point) {
      onProbe(world.probeAt(point.x, point.y));
      lastProbeTick.current = world.ticks;
    }
  }, [world, onProbe]);
  useLayoutEffect(() => {
    pinRef.current = null;
    lastProbeTick.current = -Infinity;
    setPin(null);
    onProbe(null);
  }, [world, probeMode, onProbe]);
  const invalidate = useRef(() => {});
  const endStroke = useCallback((interrupted: boolean) => {
    if (active.current && !interrupted && !locked.current && !inputBlocked) {
      stroke.release(stamp);
      readPin();
      invalidate.current();
    }
    cancelStroke();
  }, [stroke, stamp, locked, inputBlocked, cancelStroke, readPin]);
  const display = useRef({ camera, tool, probeMode });
  useLayoutEffect(() => {
    display.current = { camera, tool, probeMode };
    invalidate.current();
  }, [camera, tool, probeMode, revision]);
  useEffect(() => {
    // Native Canvas commits its own React tree asynchronously. Hermes tracks
    // each image's native memory and releases it after the last Skia reference.
    if (Platform.OS === 'web') return () => frame.image?.dispose();
  }, [frame]);
  useLayoutEffect(() => {
    let pending = 0,
      previous: number | undefined,
      debt = 0,
      dirty = true;
    function paintFrame(time: number) {
      pending = 0;
      if (!paused && !locked.current && previous !== undefined) {
        debt += Math.min(100, time - previous);
        while (debt >= 1000 / 30) {
          stroke.tick(stamp);
          const motion = readMotion();
          if (shakeTicks.current > 0) {
            const strength = shakeTicks.current-- / 7;
            world.step({
              gravityX: motion?.gravityX ?? 0, gravityY: motion?.gravityY ?? 1,
              shakeX: (previousPulse.current % 2 ? 1 : -1) * strength, shakeY: 0,
            });
          } else world.step(motion);
          debt -= 1000 / 30;
          dirty = true;
        }
      }
      previous = time;
      if (dirty) {
        const { camera, tool, probeMode } = display.current;
        setFrame({ image: worldImage(world, camera, pixels), tick: world.ticks });
        if (
          !probeMode &&
          lastEdit.current &&
          (camera.Heat || tool === 'Heat' || tool === 'Cool') &&
          (paused || world.ticks % 5 === 0)
        ) {
          onReading(Math.round(world.temperatureAt(lastEdit.current.x, lastEdit.current.y)));
        }
        if (probeMode && (paused || world.ticks - lastProbeTick.current >= 5)) readPin();
        dirty = false;
      }
      if (!paused) pending = requestAnimationFrame(paintFrame);
    }
    invalidate.current = () => {
      dirty = true;
      if (!pending) pending = requestAnimationFrame(paintFrame);
    };
    invalidate.current();
    return () => {
      cancelAnimationFrame(pending);
      invalidate.current = () => {};
    };
  }, [world, paused, pixels, onReading, readPin, readMotion, stroke, stamp, locked]);

  function sample(localX: number, localY: number, start: boolean) {
    if (!width || locked.current || inputBlocked || (!start && !active.current)) return;
    if (start) {
      active.current = true;
      onStroke(true);
    }
    const x = Math.floor((localX * W) / width),
      y = Math.floor((localY * W) / width);
    if (x < 0 || y < 0 || x >= W || y >= H) {
      cancelStroke();
      return;
    }
    const from = start ? null : last.current;
    if (!start && from?.x === x && from.y === y) return;
    last.current = { x, y };
    if (probeMode) {
      pinRef.current = last.current;
      setPin(pinRef.current);
    }
    if (tool === 'Probe' || (sourceMode && !start)) {
      readPin();
      return;
    }
    if (sourceMode) {
      if (!world.placeSource(tool, x, y, brush, thermalPower)) report('Source needs an empty tile');
      else report('Source placed');
    } else if (tool === 'Fan' || tool === 'Pressure' || tool === 'Suction') {
      if (!start) return;
      const hit = tool === 'Fan'
        ? world.fanAt(localX * W / width, localY * W / width, Math.max(6.5, 22 * W / width))
        : -1;
      const t = hit >= 0 ? hit : tile(x, y);
      world.paint(tool, (t % A) * 4, Math.floor(t / A) * 4);
      const d = world.device[t];
      if (tool === 'Fan' && d >= 1 && d <= 4) report('Fan facing ' + ['right', 'down', 'left', 'up'][d - 1]);
    } else {
      const dx = from ? x - from.x : 0,
        dy = from ? y - from.y : 0;
      const count = Math.max(1, Math.abs(dx), Math.abs(dy));
      for (let k = 1; k <= count; k++) {
        const px = Math.round(x - dx + (dx * k) / count),
          py = Math.round(y - dy + (dy * k) / count);
        if (tool === 'Wind') world.gust(px, py, dx / count, dy / count);
        else if (!paused && tool !== 'Wall' && tool !== 'Erase') stroke.visit(px + py * W);
        else world.paint(tool, px, py, brush, thermalPower);
      }
    }
    lastEdit.current = last.current;
    if (probeMode) readPin();
    else if (camera.Heat || tool === 'Heat' || tool === 'Cool')
      onReading(Math.round(world.temperatureAt(x, y)));
    invalidate.current();
  }
  return (
    <View style={s.board}>
      <View style={s.caption}>
        <Text style={s.scene}>{sceneName}</Text>
        <Text style={s.tick} testID="tick">
          Tick {frame.tick}
        </Text>
      </View>
      <View
        style={s.stage}
        onLayout={({ nativeEvent: { layout } }) =>
          setSize({ width: layout.width, height: layout.height })
        }
      >
        {width > 0 && (
          <View style={{ width, height: (width * H) / W }}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Canvas style={StyleSheet.absoluteFill}>
                {frame.image && (
                  <Image
                    image={frame.image}
                    x={0}
                    y={0}
                    width={width}
                    height={(width * H) / W}
                    fit="fill"
                    sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
                  />
                )}
              </Canvas>
            </View>
            {probeMode && pin && (
              <View
                pointerEvents="none"
                testID="probe-marker"
                style={[
                  s.pin,
                  {
                    left: ((pin.x + 0.5) * width) / W - 7,
                    top: ((pin.y + 0.5) * width) / W - 7,
                  },
                ]}
              />
            )}
            <StrokeSurface sample={sample} end={endStroke} />
          </View>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  pin: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#f1ffee',
    backgroundColor: 'transparent',
  },
  board: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#e2e2dd',
    borderColor: '#b9b9af',
    borderWidth: 1,
    padding: 5,
    borderRadius: 6,
  },
  caption: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  scene: { color: '#1b1b19', fontSize: 13, fontWeight: '700' },
  tick: { color: '#53534c', fontSize: 12, fontVariant: ['tabular-nums'] },
  stage: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101917',
    overflow: 'hidden',
  },
});
