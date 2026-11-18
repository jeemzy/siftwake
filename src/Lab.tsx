import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HardwareDock from './HardwareDock';
import Transport from './Transport';
import { World, type Scene, type Tool } from './world';
import Board from './Board';

const groups = {
  Materials: ['Sand', 'Water', 'Gravel', 'Smoke', 'Wood', 'Flame'],
  Air: ['Wind', 'Fan', 'Pressure', 'Suction'],
  Build: ['Wall', 'Erase'],
  World: [],
} as const satisfies Record<string, readonly Tool[]>;
const swatches: Record<Tool, string> = {
  Sand: '#e7b565',
  Water: '#469dd3',
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
const panelProps = {
  useExpoDOMWebView: false,
  scrollEnabled: false,
  bounces: false,
  style: { flex: 1, backgroundColor: '#efefeb' },
} as const;

export default function Lab() {
  const [world, setWorld] = useState(() => new World('Tunnel'));
  const [scene, setScene] = useState<Scene>('Tunnel');
  const [paused, setPaused] = useState(true);
  const [tool, setTool] = useState<Tool>('Sand');
  const [brush, setBrush] = useState(3);
  const [overlay, setOverlay] = useState(false);
  const [revision, setRevision] = useState(0);
  const [resetId, setResetId] = useState(0);
  const [feedback, setFeedback] = useState('');
  async function load(next: Scene) {
    setWorld(new World(next));
    setScene(next);
    setResetId((n) => n + 1);
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
            <View style={s.transport}>
              <Transport
                dom={panelProps}
                paused={paused}
                onPlayback={async () => setPaused((v) => !v)}
                onStep={async () => {
                  if (paused) {
                    world.step();
                    setRevision((n) => n + 1);
                  }
                }}
              />
            </View>
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
            <HardwareDock
              dom={panelProps}
              groups={groups}
              swatches={swatches}
              tool={tool}
              brush={brush}
              scene={scene}
              overlay={overlay}
              feedback={feedback}
              resetId={resetId}
              onTool={async (next) => {
                setTool(next);
                setFeedback('');
              }}
              onCategory={async () => setFeedback('')}
              onBrush={async (next) => setBrush(next)}
              onPower={async (next) => {
                world.strength = next / 100;
              }}
              onScene={load}
              onOverlay={async () => setOverlay((v) => !v)}
            />
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#efefeb' },
  screen: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  layout: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 660,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { flex: 1, color: '#1b1b19', fontSize: 28, fontWeight: '800', letterSpacing: -1.6 },
  transport: { width: 148, height: 48 },
  dock: { height: 201 },
});
