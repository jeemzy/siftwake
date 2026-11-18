import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Canvas, Image, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import { World, W, H, tile, type Tool, type Scene } from './world';
import { worldImage } from './pixels';

const colors = {
  bg: '#111918',
  card: '#1b2624',
  edge: '#35433e',
  ink: '#f5f1df',
  dim: '#acbab0',
  mint: '#a8e2bb',
  gold: '#f4c581',
};
const swatch: Record<Tool, string> = {
  Sand: '#e7b565',
  Gravel: '#909a9e',
  Smoke: '#c2d8cf',
  Wood: '#b07751',
  Flame: '#ff9353',
  Wall: '#758b83',
  Fan: '#6fd4b0',
  Pressure: '#eab08e',
  Suction: '#80b4dc',
  Wind: '#a5cfd8',
  Erase: '#d8cebd',
};
const materials: Tool[] = ['Sand', 'Gravel', 'Smoke', 'Wood', 'Flame'];
const tools: Tool[] = ['Wall', 'Fan', 'Wind', 'Pressure', 'Suction', 'Erase'];
const tip: Record<Tool, string> = {
  Sand: 'Drag to pour loose sand.',
  Gravel: 'Drag to place heavy grains.',
  Smoke: 'Drag to release a plume.',
  Wood: 'Draw fuel, then ignite an edge with flame.',
  Flame: 'Drag a spark into the current.',
  Wall: 'Drag to build an airtight partition.',
  Fan: 'Tap to place a fan. Tap again to rotate it.',
  Wind: 'Swipe in the direction you want the air to move.',
  Pressure: 'Tap to add a steady pressure source.',
  Suction: 'Tap to draw air out of a region.',
  Erase: 'Drag to clear material or cut a vent.',
};

function Button({
  name,
  onPress,
  selected,
  dot,
  disabled = false,
}: {
  name: string;
  onPress: () => void;
  selected?: boolean;
  dot?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        selected && s.chosen,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {dot && <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: dot }} />}
      <Text style={[s.label, selected && { color: colors.mint }]}>{name}</Text>
    </Pressable>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function Lab() {
  const { width, height } = useWindowDimensions(),
    compact = width < 750;
  const side = Math.max(
    120,
    Math.min(compact ? width - 42 : width - 365, (Math.max(440, height) - 200) / 1.5, 480),
  );
  const [world, setWorld] = useState(() => new World('Tunnel'));
  const [scene, setScene] = useState<Scene>('Tunnel'),
    [paused, setPaused] = useState(true);
  const [tool, setTool] = useState<Tool>('Sand'),
    [overlay, setOverlay] = useState(false);
  const [power, setPower] = useState(55),
    [brush, setBrush] = useState(3);
  const [tick, setTick] = useState(0),
    [feedback, setFeedback] = useState('');
  const [pixels] = useState(() => new Uint8Array(W * H * 4));
  const [image, setImage] = useState(() => worldImage(world, false, pixels));
  const last = useRef<{ x: number; y: number } | null>(null);
  const redraw = useCallback(() => {
    setImage(worldImage(world, overlay, pixels));
    setTick(world.ticks);
  }, [world, overlay, pixels]);
  useEffect(
    () => () => {
      image?.dispose();
    },
    [image],
  );
  useEffect(() => {
    redraw();
  }, [redraw]);
  useEffect(() => {
    if (paused) return;
    let frame = 0,
      previous = 0,
      debt = 0;
    const loop = (time: number) => {
      if (previous) debt += Math.min(100, time - previous);
      previous = time;
      let advanced = false;
      while (debt >= 1000 / 30) {
        world.step();
        debt -= 1000 / 30;
        advanced = true;
      }
      if (advanced) redraw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [world, paused, redraw]);
  function load(next: Scene) {
    setScene(next);
    setPaused(true);
    setWorld(new World(next));
    setPower(55);
    setFeedback('');
    last.current = null;
  }
  function stroke(event: GestureResponderEvent, start = false) {
    const x = Math.floor((event.nativeEvent.locationX / side) * W);
    const y = Math.floor((event.nativeEvent.locationY / (side * 1.5)) * H);
    const from = start ? null : last.current;
    last.current = { x, y };
    const dx = from ? x - from.x : 0,
      dy = from ? y - from.y : 0;
    if (tool === 'Fan' || tool === 'Pressure' || tool === 'Suction') {
      if (!start || x < 0 || x >= W || y < 0 || y >= H) return;
      world.paint(tool, x, y);
      const d = world.device[tile(x, y)];
      setFeedback(d > 0 && d <= 4 ? 'Fan facing ' + ['right', 'down', 'left', 'up'][d - 1] : '');
    } else {
      const count = Math.max(1, Math.abs(dx), Math.abs(dy));
      for (let k = 1; k <= count; k++) {
        const px = Math.round(x - dx + (dx * k) / count),
          py = Math.round(y - dy + (dy * k) / count);
        if (tool === 'Wind') world.gust(px, py, dx / count, dy / count);
        else world.paint(tool, px, py, brush);
      }
    }
    redraw();
  }
  function choose(value: Tool) {
    setTool(value);
    setFeedback('');
  }
  const controls = (
    <View style={[s.controls, compact && { width: side + 18 }]}>
      <Section title="Materials">
        <View style={s.row}>
          {materials.map((m) => (
            <Button
              key={m}
              name={m}
              dot={swatch[m]}
              selected={tool === m}
              onPress={() => choose(m)}
            />
          ))}
        </View>
      </Section>
      <Section title="Tools">
        <View style={s.row}>
          {tools.map((m) => (
            <Button
              key={m}
              name={m}
              dot={swatch[m]}
              selected={tool === m}
              onPress={() => choose(m)}
            />
          ))}
        </View>
        <Text style={s.hint}>{feedback || tip[tool]}</Text>
      </Section>
      <Section title="Fan strength">
        <View style={s.sliderRow}>
          <Slider
            accessibilityLabel="Fan strength"
            testID="fan-strength"
            style={{ flex: 1, height: 30 }}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={power}
            minimumTrackTintColor={colors.mint}
            maximumTrackTintColor={colors.edge}
            thumbTintColor={colors.mint}
            onValueChange={(n: number) => {
              world.strength = n / 100;
              setPower(n);
            }}
          />
          <Text style={s.number}>{power}%</Text>
        </View>
      </Section>
      <Section title="Brush">
        <View style={s.row}>
          {[1, 3, 6].map((n, i) => (
            <Button
              key={n}
              name={['Fine', 'Medium', 'Wide'][i]}
              selected={brush === n}
              onPress={() => setBrush(n)}
            />
          ))}
        </View>
      </Section>
      <View style={s.row}>
        <Button name="Pressure overlay" selected={overlay} onPress={() => setOverlay((v) => !v)} />
      </View>
      {overlay && <Text style={s.hint}>Blue · low Dark · neutral Amber · high</Text>}
    </View>
  );
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ alignItems: 'center', padding: compact ? 12 : 22 }}
    >
      <View style={{ width: compact ? side + 18 : side + 318, maxWidth: '100%' }}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.logo}>
            Siftwake
          </Text>
          <Text style={s.state}>{paused ? 'Ⅱ   PAUSED' : '●   RUNNING'}</Text>
        </View>
        <View
          style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'flex-start', gap: 16 }}
        >
          <View style={{ width: side + 18, gap: 8 }}>
            <View style={s.board}>
              <View style={s.boardHead}>
                <Text style={s.heading}>
                  {scene === 'Tunnel' ? 'Comparison tunnel' : 'Blank canvas'}
                </Text>
                <Text testID="tick" style={s.counter}>
                  Tick {tick}
                </Text>
              </View>
              <View
                testID="world"
                accessibilityLabel="Simulation canvas"
                style={{
                  width: side,
                  height: side * 1.5,
                  overflow: 'hidden',
                  ...{ touchAction: 'none' },
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => stroke(e, true)}
                onResponderMove={(e) => stroke(e)}
                onResponderRelease={() => {
                  last.current = null;
                }}
                onResponderTerminate={() => {
                  last.current = null;
                }}
              >
                <View pointerEvents="none">
                  <Canvas style={{ width: side, height: side * 1.5 }}>
                    {image && (
                      <Image
                        image={image}
                        x={0}
                        y={0}
                        width={side}
                        height={side * 1.5}
                        fit="fill"
                        sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
                      />
                    )}
                  </Canvas>
                </View>
              </View>
            </View>
            <View style={s.row}>
              <Button
                name={paused ? 'Play' : 'Pause'}
                selected={true}
                onPress={() => setPaused((v) => !v)}
              />
              <Button
                name="Step"
                disabled={!paused}
                onPress={() => {
                  world.step();
                  redraw();
                }}
              />
              <Button name="Reset" onPress={() => load(scene)} />
              <Button
                name={scene === 'Tunnel' ? 'Blank canvas' : 'Load tunnel'}
                onPress={() => load(scene === 'Tunnel' ? 'Blank' : 'Tunnel')}
              />
            </View>
          </View>
          {controls}
        </View>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: { color: colors.ink, fontSize: 33, fontWeight: '800', letterSpacing: -1.8 },
  state: { fontSize: 11, color: colors.mint, letterSpacing: 1.4, fontWeight: '700' },
  board: {
    padding: 8,
    backgroundColor: colors.card,
    borderColor: colors.edge,
    borderWidth: 1,
    borderRadius: 10,
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 3,
  },
  heading: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  counter: { color: colors.dim, fontVariant: ['tabular-nums'], fontSize: 12 },
  controls: {
    width: 284,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 10,
    gap: 18,
  },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#23302c',
  },
  chosen: { borderColor: '#79b893', backgroundColor: '#274538' },
  label: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  hint: { color: colors.dim, lineHeight: 18, fontSize: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  number: { color: colors.mint, minWidth: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
