import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Image, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import StrokeSurface from './StrokeSurface';
import type { Layers } from './views';
import { worldImage } from './pixels';
import { World, W, H, tile, type Tool } from './world';

type Props = {
  world: World;
  paused: boolean;
  camera: Layers;
  onReading: (value: number) => void;
  tool: Tool;
  brush: number;
  revision: number;
  sceneName: string;
  report: (message: string) => void;
};

export default function Board({
  world,
  paused,
  camera,
  onReading,
  tool,
  brush,
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
  const probe = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    probe.current = null;
  }, [world]);
  const invalidate = useRef(() => {});
  const display = useRef({ camera, tool });
  useLayoutEffect(() => {
    display.current = { camera, tool };
    invalidate.current();
  }, [camera, tool, revision]);
  useEffect(() => () => frame.image?.dispose(), [frame]);
  useLayoutEffect(() => {
    let pending = 0,
      previous: number | undefined,
      debt = 0,
      dirty = true;
    function paintFrame(time: number) {
      pending = 0;
      if (!paused && previous !== undefined) {
        debt += Math.min(100, time - previous);
        while (debt >= 1000 / 30) {
          world.step();
          debt -= 1000 / 30;
          dirty = true;
        }
      }
      previous = time;
      if (dirty) {
        const { camera, tool } = display.current;
        setFrame({ image: worldImage(world, camera, pixels), tick: world.ticks });
        if (
          probe.current &&
          (camera.Heat || tool === 'Heat' || tool === 'Cool') &&
          (paused || world.ticks % 5 === 0)
        ) {
          onReading(Math.round(world.temperatureAt(probe.current.x, probe.current.y)));
        }
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
  }, [world, paused, pixels, onReading]);
  useLayoutEffect(() => {
    last.current = null;
  }, [world, tool, width]);

  function sample(localX: number, localY: number, start: boolean) {
    if (!width) return;
    const x = Math.floor((localX * W) / width),
      y = Math.floor((localY * W) / width);
    if (x < 0 || y < 0 || x >= W || y >= H) {
      last.current = null;
      return;
    }
    const from = start ? null : last.current;
    if (!start && from?.x === x && from.y === y) return;
    last.current = { x, y };
    if (tool === 'Fan' || tool === 'Pressure' || tool === 'Suction') {
      if (!start) return;
      world.paint(tool, x, y);
      const d = world.device[tile(x, y)];
      if (tool === 'Fan') report(d ? 'Fan facing ' + ['right', 'down', 'left', 'up'][d - 1] : '');
    } else {
      const dx = from ? x - from.x : 0,
        dy = from ? y - from.y : 0;
      const count = Math.max(1, Math.abs(dx), Math.abs(dy));
      for (let k = 1; k <= count; k++) {
        const px = Math.round(x - dx + (dx * k) / count),
          py = Math.round(y - dy + (dy * k) / count);
        if (tool === 'Wind') world.gust(px, py, dx / count, dy / count);
        else world.paint(tool, px, py, brush);
      }
    }
    probe.current = { x, y };
    if (camera.Heat || tool === 'Heat' || tool === 'Cool')
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
            <StrokeSurface
              sample={sample}
              end={() => {
                last.current = null;
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
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
