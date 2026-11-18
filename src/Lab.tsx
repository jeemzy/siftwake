import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { World, type Scene, type Tool } from './world';
import Board from './Board';

const groups = {
  Materials: ['Sand', 'Gravel', 'Smoke', 'Wood', 'Flame'],
  Air: ['Wind', 'Fan', 'Pressure', 'Suction'],
  Build: ['Wall', 'Erase'],
  World: [],
} as const satisfies Record<string, readonly Tool[]>;
type Group = keyof typeof groups;
const categories: Group[] = ['Materials', 'Air', 'Build', 'World'];
const swatches: Record<Tool, string> = {
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
// Original five-pixel glyphs keep each category recognizable at hotbar size.
const emblems: Record<Group, [string, number[]]> = {
  Materials: ['#edc486', [4, 14, 31, 27, 14]],
  Air: ['#a3d8ce', [3, 17, 30, 0, 14]],
  Build: ['#b6b9ab', [27, 27, 0, 13, 13]],
  World: ['#9cbce5', [14, 19, 29, 19, 14]],
};
function Emblem({ group }: { group: Group }) {
  const [color, rows] = emblems[group];
  return (
    <View accessible={false}>
      {rows.map((row, y) => (
        <View key={y} style={s.pixelRow}>
          {[16, 8, 4, 2, 1].map((bit) => (
            <View
              key={bit}
              style={{ width: 3, height: 3, backgroundColor: row & bit ? color : 'transparent' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
function Slot({
  name,
  onPress,
  selected = false,
  disabled = false,
  dot,
  large = false,
  group,
  compact = false,
}: {
  name: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  dot?: string;
  large?: boolean;
  group?: Group;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.slot,
        large && s.fill,
        group && s.category,
        compact && s.compact,
        selected && s.selected,
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      {group && <Emblem group={group} />}
      {dot && <View style={[s.swatch, { backgroundColor: dot }]} />}
      <Text numberOfLines={1} adjustsFontSizeToFit style={[s.label, selected && s.activeText]}>
        {name}
      </Text>
    </Pressable>
  );
}
export default function Lab() {
  const [world, setWorld] = useState(() => new World('Tunnel'));
  const [scene, setScene] = useState<Scene>('Tunnel'),
    [paused, setPaused] = useState(true);
  const [category, setCategory] = useState<Group>('Materials'),
    [tool, setTool] = useState<Tool>('Sand');
  const [brush, setBrush] = useState(3),
    [power, setPower] = useState(55),
    [overlay, setOverlay] = useState(false);
  const [revision, setRevision] = useState(0),
    [feedback, setFeedback] = useState('');
  function load(next: Scene) {
    setWorld(new World(next));
    setScene(next);
    setPower(55);
    setPaused(true);
    setFeedback('');
  }
  return (
    <SafeAreaProvider style={s.root}>
      <SafeAreaView style={s.screen}>
        <View style={s.layout}>
          <View style={s.header}>
            <Text accessibilityRole="header" style={s.logo}>
              Siftwake
            </Text>
            <Slot name={paused ? 'Play' : 'Pause'} selected onPress={() => setPaused((v) => !v)} />
            <Slot
              name="Step"
              disabled={!paused}
              onPress={() => {
                world.step();
                setRevision((n) => n + 1);
              }}
            />
          </View>
          <Board
            world={world}
            paused={paused}
            tool={tool}
            brush={brush}
            overlay={overlay}
            revision={revision}
            sceneName={scene === 'Tunnel' ? 'Comparison tunnel' : 'Blank canvas'}
            report={setFeedback}
          />
          <View style={s.dock}>
            <View style={s.settings}>
              {category === 'Air' ? (
                <>
                  <Text style={s.note} numberOfLines={1}>
                    {feedback || 'Fan strength'}
                  </Text>
                  <Slider
                    accessibilityLabel="Fan strength"
                    testID="fan-strength"
                    style={{ flex: 1, height: 32 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={power}
                    minimumTrackTintColor="#a8e2bb"
                    maximumTrackTintColor="#43554b"
                    thumbTintColor="#a8e2bb"
                    onValueChange={(n: number) => {
                      world.strength = n / 100;
                      setPower(n);
                    }}
                  />
                  <Text style={s.note}>{power}%</Text>
                </>
              ) : category === 'World' ? (
                <Text style={s.note}>
                  {overlay
                    ? 'Blue · low     Dark · neutral     Amber · high'
                    : 'Painting with ' + tool}
                </Text>
              ) : (
                <>
                  <Text style={s.note}>Brush</Text>
                  {[1, 3, 6].map((n, i) => (
                    <Slot
                      key={n}
                      compact
                      name={['Fine', 'Medium', 'Wide'][i]}
                      selected={brush === n}
                      onPress={() => setBrush(n)}
                    />
                  ))}
                </>
              )}
            </View>
            <View style={s.row}>
              {category === 'World' ? (
                <>
                  <Slot large name="Reset" onPress={() => load(scene)} />
                  <Slot
                    large
                    name={scene === 'Tunnel' ? 'Blank canvas' : 'Load tunnel'}
                    onPress={() => load(scene === 'Tunnel' ? 'Blank' : 'Tunnel')}
                  />
                  <Slot
                    large
                    name="Pressure overlay"
                    selected={overlay}
                    onPress={() => setOverlay((v) => !v)}
                  />
                </>
              ) : (
                groups[category].map((item) => (
                  <Slot
                    key={item}
                    large
                    name={item}
                    dot={swatches[item]}
                    selected={tool === item}
                    onPress={() => {
                      setTool(item);
                      setFeedback('');
                    }}
                  />
                ))
              )}
            </View>
            <View style={s.rack}>
              {categories.map((group) => (
                <Slot
                  key={group}
                  large
                  group={group}
                  name={group}
                  selected={group === category}
                  onPress={() => {
                    setCategory(group);
                    setFeedback('');
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111918' },
  screen: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  layout: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 660,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { flex: 1, color: '#f5f1df', fontSize: 28, fontWeight: '800', letterSpacing: -1.6 },
  dock: {
    gap: 4,
    padding: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#425449',
    backgroundColor: '#1c2924',
  },
  settings: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 5 },
  note: { color: '#c9d7cb', fontSize: 12, fontWeight: '600', paddingHorizontal: 5 },
  row: { flexDirection: 'row', gap: 4 },
  rack: { flexDirection: 'row', paddingTop: 4, gap: 4, borderTopWidth: 1, borderColor: '#4d5c51' },
  slot: {
    minWidth: 0,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderColor: '#53655a',
    borderBottomColor: '#14241d',
    borderBottomWidth: 3,
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#2b3832',
  },
  category: { gap: 4, minHeight: 46, backgroundColor: '#233129' },
  fill: { flex: 1, paddingHorizontal: 2, gap: 3 },
  compact: { minHeight: 32, paddingHorizontal: 12 },
  selected: { borderColor: '#b7e3bd', borderBottomColor: '#749a78', backgroundColor: '#374d3c' },
  label: { color: '#e1e9dd', fontSize: 12, fontWeight: '600' },
  activeText: { color: '#e5ffe7' },
  pixelRow: { flexDirection: 'row' },
  swatch: { width: 12, height: 6, borderWidth: 1, borderColor: '#ffffff32' },
});
