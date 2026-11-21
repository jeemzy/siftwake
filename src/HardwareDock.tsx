'use dom';
import { useLayoutEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import type { DOMProps } from 'expo/dom';
import { Hardware } from '@/registry/hardware/ui/hardware';
import { Tabs } from '@/registry/hardware/ui/tabs';
import { FlatKnob } from '@/registry/hardware/ui/flat-knob';
import { Button } from '@/registry/hardware/ui/button';
import { Checkbox } from '@/registry/hardware/ui/checkbox';
import { views, isChecked, type Layers, type ViewName } from './views';
import ProbeCartridge from './ProbeCartridge';
import Transport, { SideKey } from './Transport';
import BrushSlider from './BrushSlider';
import MaterialEditor from './MaterialEditor';
import Inventory, { catalogEntries } from './Inventory';
import { M, type Material, type MaterialDraft, type MaterialResult } from './materials';
import type { BuiltinTool, Tool, Scene, ProbeReading } from './world';
import '../vendor/spec-01/fonts/spec-mono.css';
import './hardware-layout.css';

type Group = 'Materials' | 'Air' | 'Build' | 'World' | 'Thermal';
const materialId = (tool: Tool) => typeof tool === 'number' ? tool : M[tool as keyof typeof M];

function ScreenKey({ children, className = '', ...props }: ComponentPropsWithoutRef<'button'>) {
  return <button {...props} type="button" className={`sw-lcd-key ${className}`}
    data-selected={props['aria-pressed'] === true || undefined}>
    <span className="sw-lcd-key-face">{children}</span>
  </button>;
}

type Props = {
  groups: Record<Group, readonly BuiltinTool[]>;
  materials: readonly Material[];
  hotbar: (number | null)[];
  sourceMode: boolean;
  thermalPower: number;
  inventoryOpen: boolean;
  inventoryViewportHeight?: number;
  onHotbarChange: (slots: (number | null)[]) => Promise<void>;
  onInventoryVisibility: (open: boolean) => Promise<void>;
  onSourceMode: (enabled: boolean) => Promise<void>;
  onThermalPower: (percent: number) => Promise<void>;
  onAgitate: () => Promise<void>;
  expanded: boolean;
  tool: Tool;
  brush: number;
  scene: Scene;
  camera: Layers;
  probe: ProbeReading | null;
  probeMode: boolean;
  onProbeMode: (enabled: boolean) => Promise<void>;
  paused: boolean;
  onPlayback: () => Promise<void>;
  onStep: () => Promise<void>;
  reading: number | null;
  feedback: string;
  category: Group;
  power: number;
  motionSupported: boolean;
  motionEnabled: boolean;
  motionPending: boolean;
  motionStatus: string;
  onMotionChange: (enabled: boolean) => Promise<void>;
  sceneGeneration: number;
  updateLabel: string;
  updateReady: boolean;
  onRestart: () => Promise<void>;
  onSave: () => Promise<string>;
  onEditorVisibility: (visible: boolean) => Promise<void>;
  onMaterial: (id: number | null, draft: MaterialDraft) => Promise<MaterialResult>;
  onTool: (tool: Tool) => Promise<void>;
  onBrush: (radius: number) => Promise<void>;
  onPower: (power: number) => Promise<void>;
  onScene: (scene: Scene) => Promise<void>;
  onViewChange: (view: ViewName, enabled: boolean) => Promise<void>;
  onCategory: (category: Group) => Promise<void>;
  dom?: DOMProps;
};

export default function HardwareDock(props: Props) {
  const { category } = props;
  const [editor, setEditor] = useState<{ material?: Material } | null>(null);
  const [saveStatus, setSaveStatus] = useState('');
  const entries = useMemo(() => catalogEntries(props.materials), [props.materials]);
  const slots = props.hotbar;
  const equippedId = materialId(props.tool);
  const equipped = entries.find(entry => entry.id === equippedId);
  const thermal = props.tool === 'Heat' || props.tool === 'Cool';
  const intended = useRef<{ tool: Tool; source: boolean } | null>(null);
  const echoed = useRef({ tool: props.tool, source: props.sourceMode });
  const actions = useRef(Promise.resolve());
  useLayoutEffect(() => {
    echoed.current = { tool: props.tool, source: props.sourceMode };
    if (intended.current?.tool === props.tool && intended.current.source === props.sourceMode)
      intended.current = null;
  }, [props.tool, props.sourceMode]);
  function requestSelection(tool: Tool, source: boolean, action: () => Promise<void>) {
    const intent = { tool, source };
    intended.current = intent;
    const task = actions.current.then(action).then(() => {
      if (intended.current === intent && echoed.current.tool === tool && echoed.current.source === source)
        intended.current = null;
    });
    actions.current = task.catch(() => { if (intended.current === intent) intended.current = null; });
    return task;
  }
  function equip(tool: Tool) {
    return requestSelection(tool, false, () => props.onTool(tool));
  }
  function playKey(tool: Tool) {
    const current = intended.current?.tool ?? props.tool;
    const id = materialId(tool);
    const eligible = tool === 'Heat' || tool === 'Cool' || entries.some(e => e.id === id && e.sourceEligible);
    if (eligible && (tool === current || (id !== undefined && id === materialId(current)))) {
      const source = !(intended.current?.source ?? props.sourceMode);
      return requestSelection(current, source, () => props.onSourceMode(source));
    }
    return equip(tool);
  }
  function openEditor(material?: Material) {
    void props.onEditorVisibility(true);
    setEditor({ material });
  }
  function closeEditor() {
    setEditor(null);
    void props.onEditorVisibility(false);
  }
  const [power, setPower] = useState(props.power);
  useLayoutEffect(() => setPower(props.power), [props.power, props.sceneGeneration]);

  // Swap the contents of the mounted glass when the backlight reaches black.
  const wanted = category === 'Thermal' && props.probeMode ? 'Probe' : category;
  const [screen, setScreen] = useState<Group | 'Probe'>(wanted);
  const [lit, setLit] = useState(true);
  useLayoutEffect(() => {
    if (screen === wanted || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScreen(wanted);
      setLit(true);
      return;
    }
    setLit(false);
    const exchange = setTimeout(() => { setScreen(wanted); setLit(true); }, 115);
    return () => clearTimeout(exchange);
  }, [screen, wanted]);

  function thermalKey(item: 'Heat' | 'Cool', icon: boolean) {
    const active = item === props.tool;
    const source = active && props.sourceMode;
    return <ScreenKey key={item} aria-label={item} aria-pressed={active}
      aria-description={source ? 'Source placement' : undefined}
      className={icon ? 'sw-probe-side' : undefined} data-source={source || undefined}
      data-thermal={item} onClick={() => void playKey(item)}>
      {icon ? <ThermalIcon tool={item} /> : item}
    </ScreenKey>;
  }
  function worldKeys() {
    return <>
      <ScreenKey onClick={() => props.onScene(props.scene)}>Reset</ScreenKey>
      <ScreenKey onClick={async () => {
        setSaveStatus('');
        try { setSaveStatus(await props.onSave()); } catch { setSaveStatus('World could not be saved.'); }
      }}>Save</ScreenKey>
      {props.updateReady && <ScreenKey onClick={() => props.onRestart()}>Restart to update</ScreenKey>}
      <ScreenKey onClick={() => props.onScene(props.scene === 'Tunnel' ? 'Blank' : 'Tunnel')}>
        {props.scene === 'Tunnel' ? 'Blank canvas' : 'Load tunnel'}
      </ScreenKey>
    </>;
  }
  return (
    <Hardware className="sw-dock" data-native-host={props.inventoryViewportHeight !== undefined || undefined}
      data-expanded={props.expanded || undefined}>
      <div className="sw-cartridge-stage" role="region" aria-label="Tool cartridge"
        data-screen={screen} data-power={lit ? 'on' : 'off'}>
        <div className="sw-glass" inert={!lit}>
          <Inventory open={!!props.inventoryOpen} visible={screen === 'Materials'}
            viewportHeight={props.inventoryViewportHeight} hostReady={props.expanded}
            entries={entries} slots={slots} equipped={equippedId} sourceMode={!!props.sourceMode}
            onPlayKey={playKey} onUse={playKey} onVisibility={props.onInventoryVisibility}
            onChange={props.onHotbarChange} onNew={() => openEditor()}
            onEdit={id => openEditor(props.materials.find(m => m.id === id))}>
          {screen === 'Probe' ? <div className="sw-display-keys sw-lcd-pane sw-probe-controls">
            {thermalKey('Cool', true)}
            <div className="sw-inspect-readout">
              <ProbeCartridge reading={props.probe} />
              <button type="button" className="sw-readout-action" aria-label={thermal ? 'Probe only' : 'Close probe'}
                title={thermal ? 'Probe only' : 'Close probe'}
                onClick={() => thermal ? void equip('Probe') : void props.onProbeMode(false)} />
            </div>
            {thermalKey('Heat', true)}
          </div> : screen !== 'Materials' && <div className="sw-display-keys sw-lcd-pane" aria-label={screen + ' tools'} role="group">
            {screen === 'World' ? worldKeys() : screen === 'Thermal' ? <>
              {thermalKey('Cool', false)}
              <ScreenKey onClick={() => props.onProbeMode(true)}>Probe</ScreenKey>
              {thermalKey('Heat', false)}
            </> : props.groups[screen].map(item =>
              <ScreenKey key={item} aria-pressed={item === props.tool}
                onClick={() => void playKey(item)}>{item}</ScreenKey>
            )}
          </div>}
          </Inventory>
        </div>
      </div>
      <div className="sw-face">
        <div className="sw-control-deck">
          <div className="sw-left-rail">
            <BrushSlider brush={props.brush} onBrush={props.onBrush} />
            <SideKey label="Agitate" symbol="↔" disabled={props.paused} onPress={props.onAgitate} title="Shake the chamber" />
          </div>
          <div className="sw-console">
            <div className="sw-dial-row">
              {category === 'Thermal' && <FlatKnob label="Thermal power" color="white" value={props.thermalPower ?? 100}
                onValueChange={next => void props.onThermalPower(next)} />}
              {category === 'Air' && <FlatKnob label="Fan strength" color="white" value={power}
                onValueChange={next => { setPower(next); void props.onPower(next); }} />}
              {(category === 'Materials' || category === 'Thermal' || category === 'Build') &&
                <span className="sw-current-tool">{props.probeMode && category === 'Thermal' && thermal ? 'Probe + ' : ''}
                  {props.sourceMode ? 'Source · ' : ''}{equipped?.name ?? props.tool}
                  {category === 'Materials' && equipped && !slots.includes(equipped.id) ? ' · Unbound' : ''}</span>}
            </div>
            {category === 'Air' && <div className="sw-air-actions">
              {props.motionSupported && <Button aria-pressed={props.motionEnabled} aria-busy={props.motionPending}
                disabled={props.motionPending} onClick={() => props.onMotionChange(!props.motionEnabled)}>Motion</Button>}
              <span role="status">{props.motionStatus || props.feedback}</span>
            </div>}
            {category === 'World' && <div role="group" aria-label="Camera" className="sw-cameras">
              {views.map(view => <Checkbox key={view} label={view} checked={isChecked(props.camera, view)}
                onCheckedChange={checked => void props.onViewChange(view, checked)} />)}
            </div>}
            <div className="sw-legend">
              {props.camera.Heat && <><span aria-hidden className="sw-heat-scale" />−150…2300 °C</>}
              {props.camera.Pressure && <span>Blue · low　Amber · high</span>}
              {props.camera.Air && <span>› flow</span>}
              {category === 'World' && <span className="sw-save-status" role="status">{saveStatus ||
                (isChecked(props.camera, 'Normal') ? props.updateLabel : '')}</span>}
              {category === 'Thermal' && !props.probeMode && props.reading !== null &&
                <output aria-label="Brush temperature">{props.reading} °C</output>}
            </div>
          </div>
          <Transport paused={props.paused} onPlayback={props.onPlayback} onStep={props.onStep} />
        </div>
        <Tabs label="Tool categories" value={category}
          onValueChange={next => { setSaveStatus(''); void props.onCategory(next as Group); }}
          items={(Object.keys(props.groups) as Group[]).map(group => ({ value: group, label: group, body: null }))} />
      </div>
      {editor && <MaterialEditor material={editor.material} catalog={props.materials}
        onCommit={props.onMaterial} onClose={closeEditor} />}
    </Hardware>
  );
}

function ThermalIcon({tool}: {tool: 'Heat' | 'Cool'}) {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    {tool === 'Cool' ? <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {[0,60,120,180,240,300].map(angle => <path key={angle} transform={'rotate(' + angle + ' 12 12)'}
        d="M12 12V3 M12 7l-2.4-2.4 M12 7l2.4-2.4" />)}
    </g> : <g fill="currentColor">
      <path d="M2 18c2-4 5-7 9-8L8 4l5 3 3-5 1 6 4 2-1 2 3 1-1 3-7-1-2 2 5 1-2 2-6-1-4 3 1-5-5 1Z"/>
      <path fill="var(--sw-key-fill, #adbc9e)" d="M16 9.5l3 1-2.8.8z"/>
    </g>}
  </svg>;
}
