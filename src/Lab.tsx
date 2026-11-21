import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HardwareDock from './HardwareDock';
import { World, type Scene, type Tool, type ProbeReading } from './world';
import Board from './Board';
import { saveAndRestart } from './updateCheck';
import { groups } from './tools';
import { loadSession, saveSession } from './storage';
import { checkUpdate, applyUpdate, updateLabel } from './ota';
import { classicHotbar, defaultHotbar, type Editor, type Session } from './checkpoint';
import { changeLayer, normal } from './views';
import { usePhoneMotion } from './usePhoneMotion';

const panelProps = {
  useExpoDOMWebView: false,
  scrollEnabled: true,
  bounces: false,
  style: { flex: 1, backgroundColor: 'transparent' },
} as const;
const panelTop = 5;
const panelBottom = 25;
const dockHeight = 241;

function checkpointKey({ world, editor: { motionEnabled = false, ...editor } }: Session) {
  return JSON.stringify([world.ticks, world.edits, world.strength, editor, motionEnabled]);
}

export default function Lab() {
  const { width: windowWidth } = useWindowDimensions();
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [clipHeight, setClipHeight] = useState(0);
  const nativeHost = Platform.OS !== 'web';
  const viewportHeight = Math.max(0, layoutHeight - panelTop - panelBottom);
  const [loaded] = useState(loadSession);
  const restored = loaded.session?.editor;
  const [world, setWorld] = useState(() => loaded.session?.world ?? new World('Tunnel'));
  const [scene, setScene] = useState<Scene>(restored?.scene ?? 'Tunnel');
  const [paused, setPaused] = useState(true);
  const [tool, setTool] = useState<Tool>(restored?.tool ?? defaultHotbar[0]);
  const [brush, setBrush] = useState(restored?.brush ?? 3);
  const [hotbar, setHotbar] = useState<(number | null)[]>(
    restored?.hotbar ?? [...(restored ? classicHotbar : defaultHotbar)],
  );
  const [probeMode, setProbeMode] = useState(restored?.probeMode ?? false);
  const toolBeforeProbe = useRef<Tool>(tool === 'Probe'
    ? hotbar.find((id) => id !== null) ?? defaultHotbar[0] : tool);
  const [thermalPower, setThermalPower] = useState(restored?.thermalPower ?? 100);
  const [sourceMode, setSourceMode] = useState(restored?.sourceMode ?? false);
  const [agitatePulse, setAgitatePulse] = useState(0);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const resumeOnClose = useRef(false);
  const [camera, setCamera] = useState(restored?.camera ?? normal);
  const [probe, setProbe] = useState<ProbeReading | null>(null);
  const [reading, setReading] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState<Editor['category']>(restored?.category ?? 'Materials');
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);
  const [notice, setNotice] = useState(loaded.warning ?? '');
  const [applying, setApplying] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(restored?.motionEnabled ?? false);
  const motion = usePhoneMotion(motionEnabled, setMotionEnabled, !paused && !applying);
  // A web dialog uses the browser's top layer. On native open the touch clip
  // over the board, keeping the WebView's viewport and screen origin fixed.
  const expandedDock = (inventoryOpen || editorOpen) && Platform.OS !== 'web';
  const locked = useRef(false),
    drawing = useRef(false),
    waiting = useRef(false);
  const latest = useRef<Session>({ world, editor: { scene, tool, brush, camera, category, motionEnabled,
    hotbar, thermalPower, sourceMode, probeMode } });
  useLayoutEffect(() => {
    latest.current = { world, editor: { scene, tool, brush, camera, category, motionEnabled,
      hotbar, thermalPower, sourceMode, probeMode } };
  }, [world, scene, tool, brush, camera, category, motionEnabled, hotbar, thermalPower, sourceMode, probeMode]);
  const saved = useRef<{ world: World; key: string } | null>(
    loaded.session ? { world: loaded.session.world, key: checkpointKey(loaded.session) } : null,
  );
  function checkpoint() {
    if (!loaded.writable) throw Error('World storage unavailable');
    const state = latest.current;
    const key = checkpointKey(state);
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
      if (loaded.writable && !locked.current) {
        try {
          checkpoint();
        } catch {
          setNotice('World could not be saved. Check available storage.');
        }
      }
    };
    check();
    const timer = setInterval(() => {
      if (!drawing.current) save();
    }, 15000);
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
  function deferUpdate() {
    waiting.current = false;
    setNotice('');
    setLater(true);
    if (ready && loaded.writable && !drawing.current) {
      try {
        checkpoint();
      } catch {
        setNotice('World could not be saved. Check available storage.');
      }
    }
  }
  async function restart() {
    if (locked.current) return;
    if (drawing.current) {
      waiting.current = true;
      return;
    }
    waiting.current = false;
    locked.current = true;
    motion.clear();
    setApplying(true);
    setPaused(true);
    try {
      await saveAndRestart(checkpoint, applyUpdate);
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
  function selectTool(next: Tool) {
    if (locked.current || (next === 'Probe' && category !== 'Thermal')) return;
    if (next === 'Probe') {
      if (!probeMode && tool !== 'Probe') toolBeforeProbe.current = tool;
      setProbeMode(true);
    } else if (category !== 'Thermal' || (next !== 'Heat' && next !== 'Cool')) {
      setProbeMode(false);
    }
    setSourceMode(false);
    setTool(next);
    setFeedback('');
  }
  function closeProbe() {
    setProbeMode(false);
    setTool((current) => current === 'Probe' ? toolBeforeProbe.current : current);
  }
  async function load(next: Scene) {
    if (locked.current) return;
    motion.clear();
    setWorld(world.reset(next));
    setSceneGeneration((n) => n + 1);
    setScene(next);
    setReading(null);
    setPaused(true);
    setFeedback('');
  }
  return (
    <SafeAreaProvider style={s.root}>
      <SafeAreaView style={s.screen}>
        <View style={s.layout} onLayout={Platform.OS === 'web' ? undefined :
          event => setLayoutHeight(event.nativeEvent.layout.height)}>
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
              <Pressable accessibilityRole="button" disabled={applying} onPress={deferUpdate}>
                <Text style={s.action}>{ready ? 'Later' : 'Dismiss'}</Text>
              </Pressable>
            </View>
          )}
          <Board
            probeMode={probeMode}
            inputBlocked={inventoryOpen || editorOpen || applying}
            sourceMode={sourceMode}
            thermalPower={thermalPower}
            agitatePulse={agitatePulse}
            locked={locked}
            onStroke={stroke}
            readMotion={motion.read}
            world={world}
            paused={paused}
            tool={tool}
            brush={brush}
            camera={camera}
            revision={revision}
            sceneName={scene === 'Tunnel' ? 'Comparison tunnel' : 'Blank canvas'}
            onProbe={setProbe}
            onReading={setReading}
            report={setFeedback}
          />
          <View style={s.dock} pointerEvents="none" />
          <View style={[s.dockPanel, nativeHost && s.nativeClip, windowWidth <= 350 && s.fullDockWidth, expandedDock && s.editorPanel]}
            onLayout={nativeHost ? event => setClipHeight(event.nativeEvent.layout.height) : undefined}>
            {/* Resize the input and clipping bounds while keeping WKWebView's backing surface stationary. */}
            <View style={nativeHost ? [s.nativePanelSurface, { height: viewportHeight }] : s.webPanelSurface}>
              {(!nativeHost || viewportHeight > 0) && <HardwareDock
                inventoryViewportHeight={nativeHost ? viewportHeight : undefined}
                probeMode={probeMode}
                onProbeMode={async (enabled) => {
                  if (locked.current) return;
                  if (enabled) selectTool('Probe');
                  else closeProbe();
                }}
                hotbar={hotbar}
                inventoryOpen={inventoryOpen}
                sourceMode={sourceMode}
                thermalPower={thermalPower}
                onHotbarChange={async (slots) => { if (!locked.current) setHotbar(slots); }}
                onSourceMode={async (enabled) => { if (!locked.current) setSourceMode(enabled); }}
                onThermalPower={async (power) => { if (!locked.current) setThermalPower(power); }}
                onAgitate={async () => {
                  if (!locked.current && !paused) setAgitatePulse((n) => n + 1);
                }}
                onInventoryVisibility={async (open) => {
                  if (locked.current || inventoryOpen === open) return;
                  if (open) {
                    resumeOnClose.current = !paused;
                    motion.clear();
                    setPaused(true);
                  } else if (resumeOnClose.current) {
                    resumeOnClose.current = false;
                    setPaused(false);
                  }
                  setInventoryOpen(open);
                }}
                dom={panelProps}
                expanded={expandedDock && viewportHeight > 0 && Math.abs(clipHeight - viewportHeight) <= 1}
                paused={paused}
                onPlayback={async () => {
                  if (!locked.current) {
                    motion.clear();
                    setPaused((v) => !v);
                  }
                }}
                onStep={async () => {
                  if (paused && !locked.current) {
                    world.step();
                    setRevision((n) => n + 1);
                  }
                }}
                probe={probe}
                groups={groups}
                materials={world.customMaterials}
                tool={tool}
                brush={brush}
                scene={scene}
                camera={camera}
                reading={reading}
                feedback={feedback}
                category={category}
                sceneGeneration={sceneGeneration}
                power={Math.round(world.strength * 100)}
                motionSupported={motion.supported}
                motionEnabled={motionEnabled}
                motionPending={motion.pending || applying}
                motionStatus={motion.status}
                onMotionChange={async (enabled) => {
                  if (!locked.current) await motion.change(enabled);
                }}
                updateLabel={updateLabel}
                updateReady={ready && later}
                onRestart={restart}
                onSave={async () => {
                  if (!loaded.writable) return 'Saved world is read-only.';
                  if (locked.current) return 'World is restarting.';
                  try {
                    checkpoint();
                    return 'World saved.';
                  } catch {
                    return 'World could not be saved.';
                  }
                }}
                onEditorVisibility={async (visible) => {
                  if (visible) {
                    motion.clear();
                    setPaused(true);
                  }
                  setEditorOpen(visible);
                }}
                onMaterial={async (id, draft) => {
                  if (locked.current) return { errors: { form: 'World is restarting.' } };
                  const result = world.saveMaterial(id, draft);
                  if ('id' in result) {
                    selectTool(result.id);
                    setRevision((n) => n + 1);
                  }
                  return result;
                }}
                onTool={async (next) => {
                  selectTool(next);
                }}
                onCategory={async (next) => {
                  if (!locked.current) {
                    if (next !== 'Thermal') closeProbe();
                    setCategory(next);
                    setFeedback('');
                  }
                }}
                onBrush={async (next) => {
                  if (!locked.current) setBrush(next);
                }}
                onPower={async (next) => {
                  if (locked.current) return;
                  world.strength = next / 100;
                }}
                onScene={load}
                onViewChange={async (view, enabled) => {
                  if (!locked.current) setCamera((previous) => changeLayer(previous, view, enabled));
                }}
              />}
            </View>
          </View>
          <Text accessibilityRole="header" style={s.logo}>
            Siftwake
          </Text>
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
  logo: { color: '#63655f', textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600' },
  dock: { height: dockHeight },
  dockPanel: { position: 'absolute', left: 8, right: 8, bottom: panelBottom, height: dockHeight },
  nativePanelSurface: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  nativeClip: { overflow: 'hidden' },
  webPanelSurface: { flex: 1 },
  fullDockWidth: { left: 0, right: 0 },
  editorPanel: { top: panelTop, height: 'auto', zIndex: 10 },
});
