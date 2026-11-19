import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HardwareDock from './HardwareDock';
import Transport from './Transport';
import { World, type Scene, type Tool } from './world';
import Board from './Board';
import { groups, swatches } from './tools';
import { loadSession, saveSession, persists } from './storage';
import { checkUpdate, applyUpdate } from './ota';
import type { Editor } from './checkpoint';
import { changeLayer, normal } from './views';

const panelProps = {
  useExpoDOMWebView: false,
  scrollEnabled: false,
  bounces: false,
  style: { flex: 1, backgroundColor: '#efefeb' },
} as const;

export default function Lab() {
  const [loaded] = useState(loadSession);
  const restored = loaded.session?.editor;
  const [world, setWorld] = useState(() => loaded.session?.world ?? new World('Tunnel'));
  const [scene, setScene] = useState<Scene>(restored?.scene ?? 'Tunnel');
  const [paused, setPaused] = useState(true);
  const [tool, setTool] = useState<Tool>(restored?.tool ?? 'Sand');
  const [brush, setBrush] = useState(restored?.brush ?? 3);
  const [camera, setCamera] = useState(restored?.camera ?? normal);
  const [reading, setReading] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState<Editor['category']>(restored?.category ?? 'Materials');
  const [power, setPower] = useState(Math.round(world.strength * 100));
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);
  const [notice, setNotice] = useState(loaded.warning ?? '');
  const [applying, setApplying] = useState(false);
  const locked = useRef(false),
    drawing = useRef(false),
    waiting = useRef(false);
  const latest = useRef({ world, editor: { scene, tool, brush, camera, category } });
  useLayoutEffect(() => {
    latest.current = { world, editor: { scene, tool, brush, camera, category } };
  }, [world, scene, tool, brush, camera, category]);
  const saved = useRef<{ world: World; key: string } | null>(null);
  function checkpoint() {
    if (!loaded.writable) throw Error('World storage unavailable');
    const state = latest.current;
    const key = JSON.stringify([
      state.world.ticks,
      state.world.edits,
      state.world.strength,
      state.editor,
    ]);
    if (saved.current?.world === state.world && saved.current.key === key) return;
    saveSession(state);
    saved.current = { world: state.world, key };
  }
  useEffect(() => {
    let mounted = true;
    const check = () => {
      void checkUpdate().then((found) => {
        if (mounted && found) setReady(true);
      });
    };
    const save = () => {
      if (persists && loaded.writable && !locked.current) {
        try {
          checkpoint();
        } catch {
          setNotice('World could not be saved. Check available storage.');
        }
      }
    };
    check();
    const timer = persists
      ? setInterval(() => {
          if (!drawing.current) save();
        }, 15000)
      : undefined;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
      else save();
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [loaded]);
  async function restart() {
    if (locked.current) return;
    if (drawing.current) {
      waiting.current = true;
      return;
    }
    waiting.current = false;
    locked.current = true;
    setApplying(true);
    setPaused(true);
    try {
      checkpoint();
      await applyUpdate();
    } catch {
      locked.current = false;
      setApplying(false);
      setLater(false);
      setNotice('Update could not restart. Your world is still open.');
    }
  }
  function stroke(active: boolean) {
    drawing.current = active;
    if (!active && waiting.current) void restart();
  }
  async function load(next: Scene) {
    if (locked.current) return;
    setWorld(new World(next));
    setPower(55);
    setScene(next);
    setReading(null);
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
                onPlayback={async () => {
                  if (!locked.current) setPaused((v) => !v);
                }}
                onStep={async () => {
                  if (paused && !locked.current) {
                    world.step();
                    setRevision((n) => n + 1);
                  }
                }}
              />
            </View>
          </View>
          {(notice || (ready && !later)) && (
            <View style={s.notice}>
              <Text style={s.noticeText}>
                {notice || (applying ? 'Restarting…' : 'Update ready')}
              </Text>
              {ready && (
                <Pressable
                  accessibilityRole="button"
                  disabled={applying}
                  onPress={() => void restart()}
                >
                  <Text style={s.action}>Restart to update</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={applying}
                onPress={() => {
                  waiting.current = false;
                  setNotice('');
                  setLater(true);
                }}
              >
                <Text style={s.action}>{ready ? 'Later' : 'Dismiss'}</Text>
              </Pressable>
            </View>
          )}
          <Board
            locked={locked}
            onStroke={stroke}
            world={world}
            paused={paused}
            tool={tool}
            brush={brush}
            camera={camera}
            revision={revision}
            sceneName={scene === 'Tunnel' ? 'Comparison tunnel' : 'Blank canvas'}
            onReading={setReading}
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
              camera={camera}
              reading={reading}
              feedback={feedback}
              category={category}
              power={power}
              updateReady={ready && later}
              onRestart={restart}
              onTool={async (next) => {
                if (locked.current) return;
                setTool(next);
                setFeedback('');
              }}
              onCategory={async (next) => {
                if (!locked.current) {
                  setCategory(next);
                  setFeedback('');
                }
              }}
              onBrush={async (next) => {
                if (!locked.current) setBrush(next);
              }}
              onPower={async (next) => {
                if (locked.current) return;
                setPower(next);
                world.strength = next / 100;
              }}
              onScene={load}
              onViewChange={async (view, enabled) => {
                if (!locked.current) setCamera((previous) => changeLayer(previous, view, enabled));
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  notice: {
    position: 'absolute',
    top: 4,
    left: 6,
    right: 6,
    zIndex: 5,
    minHeight: 48,
    backgroundColor: '#efefeb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#1b1b19' },
  action: { fontSize: 13, paddingVertical: 12, color: '#124c63' },
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
