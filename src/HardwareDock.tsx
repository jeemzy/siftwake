'use dom';
import { useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Hardware } from '@/registry/hardware/ui/hardware';
import { Tabs } from '@/registry/hardware/ui/tabs';
import { FlatKnob } from '@/registry/hardware/ui/flat-knob';
import { Button } from '@/registry/hardware/ui/button';
import { Checkbox } from '@/registry/hardware/ui/checkbox';
import { views, isChecked, type Layers, type ViewName } from './views';
import ProbeCartridge from './ProbeCartridge';
import Transport from './Transport';
import MaterialEditor from './MaterialEditor';
import type { BuiltinTool, Tool, Scene, ProbeReading } from './world';
import type { Material, MaterialDraft, MaterialResult } from './materials';
import '../vendor/spec-01/fonts/spec-mono.css';
import './hardware-layout.css';

type Group = 'Materials' | 'Air' | 'Build' | 'World' | 'Thermal';
type Props = {
  groups: Record<Group, readonly BuiltinTool[]>;
  swatches: Record<BuiltinTool, string>;
  materials: readonly Material[];
  expanded: boolean;
  tool: Tool;
  brush: number;
  scene: Scene;
  camera: Layers;
  probe: ProbeReading | null;
  paused: boolean;
  onPlayback: () => Promise<void>;
  onStep: () => Promise<void>;
  reading: number | null;
  feedback: string;
  category: Group;
  power: number;
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
  const selected = props.materials.find((material) => material.id === props.tool);
  function openEditor(material?: Material) {
    void props.onEditorVisibility(true);
    setEditor({ material });
  }
  function closeEditor() {
    setEditor(null);
    void props.onEditorVisibility(false);
  }
  // Track continuous dial gestures locally while forwarding each detent to the world.
  const [power, setPower] = useState(props.power);
  const [generation, setGeneration] = useState(props.sceneGeneration);
  if (generation !== props.sceneGeneration) {
    setGeneration(props.sceneGeneration);
    setPower(props.power);
  }

  function controls(group: Group) {
    return (
      <>
        <div className="sw-setting">
          {group === 'Air' ? (
            <>
              <FlatKnob
                label="Fan strength"
                color="white"
                value={power}
                onValueChange={(next) => {
                  setPower(next);
                  void props.onPower(next);
                }}
              />
              <span role="status">{props.feedback}</span>
            </>
          ) : group === 'World' ? (
            <div role="group" aria-label="Camera" className="sw-cameras">
              {views.map((view) => (
                <Checkbox
                  key={view}
                  label={view}
                  checked={isChecked(props.camera, view)}
                  onCheckedChange={(checked) => void props.onViewChange(view, checked)}
                />
              ))}
            </div>
          ) : (
            <>
              <span>Brush</span>
              {[1, 3, 6].map((n, i) => (
                <Button
                  key={n}
                  aria-pressed={n === props.brush}
                  tone={n === props.brush ? 'primary' : 'secondary'}
                  onClick={() => props.onBrush(n)}
                >
                  {['Fine', 'Medium', 'Wide'][i]}
                </Button>
              ))}
              {group === 'Materials' && props.tool === 'Probe' && (
                <Button onClick={() => openEditor()}>New material</Button>
              )}
            </>
          )}
        </div>
        <div className="sw-legend">
          {props.camera.Heat && (
            <>
              <span className="sw-heat-scale" aria-hidden />
              −150…2300 °C
            </>
          )}
          {props.camera.Pressure && <span>Blue · low　Amber · high</span>}
          {props.camera.Air && <span>› flow</span>}
          {isChecked(props.camera, 'Normal') && group === 'World' && !saveStatus && (
            <span className="sw-current-tool">
              {props.tool === 'Probe'
                ? 'Inspecting'
                : 'Painting with ' + (selected?.name ?? props.tool)}
            </span>
          )}
          {group === 'World' && (
            <span className="sw-save-status" role="status">
              {saveStatus}
            </span>
          )}
          {group === 'World' && isChecked(props.camera, 'Normal') && props.updateLabel && (
            <span style={{ marginLeft: 'auto' }}>{props.updateLabel}</span>
          )}
          {(props.camera.Heat || group === 'Thermal') &&
            props.tool !== 'Probe' &&
            props.reading !== null && (
              <output aria-label="Brush temperature">{props.reading} °C</output>
            )}
        </div>
        <div className="sw-tools">
          {group === 'World' ? (
            <>
              <Button onClick={() => props.onScene(props.scene)}>Reset</Button>
              <Button
                onClick={async () => {
                  setSaveStatus('');
                  try {
                    setSaveStatus(await props.onSave());
                  } catch {
                    setSaveStatus('World could not be saved.');
                  }
                }}
              >
                Save
              </Button>
              {props.updateReady && (
                <Button onClick={() => props.onRestart()}>Restart to update</Button>
              )}
              <Button onClick={() => props.onScene(props.scene === 'Tunnel' ? 'Blank' : 'Tunnel')}>
                {props.scene === 'Tunnel' ? 'Blank canvas' : 'Load tunnel'}
              </Button>
            </>
          ) : (
            props.groups[group].map((item) => (
              <Button
                key={item}
                aria-pressed={item === props.tool}
                tone={item === props.tool ? 'primary' : 'secondary'}
                onClick={() => props.onTool(item)}
              >
                <i aria-hidden style={{ backgroundColor: props.swatches[item] }} />
                {item}
              </Button>
            ))
          )}
        </div>
      </>
    );
  }
  return (
    <Hardware className="sw-dock" data-expanded={props.expanded || undefined}>
      {category === 'Materials' && props.tool !== 'Probe' ? (
        <div className="sw-bay sw-material-shelf">
          {!!props.materials.length && (
            <>
              <select
                aria-label="Custom material"
                value={selected?.id ?? ''}
                onChange={(event) => {
                  if (event.target.value) void props.onTool(Number(event.target.value));
                }}
              >
                <option value="" disabled>
                  Custom materials
                </option>
                {props.materials.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!selected}
                aria-label="Edit material"
                onClick={() => openEditor(selected)}
              >
                Edit
              </Button>
            </>
          )}
          <Button type="button" onClick={() => openEditor()}>
            New material
          </Button>
        </div>
      ) : (
        <ProbeCartridge active={props.tool === 'Probe'} reading={props.probe} />
      )}
      <div className="sw-face">
        <Tabs
          label="Tool categories"
          value={category}
          onValueChange={(next) => {
            setSaveStatus('');
            void props.onCategory(next as Group);
          }}
          items={(Object.keys(props.groups) as Group[]).map((group) => ({
            value: group,
            label: group,
            body: controls(group),
          }))}
        />
        <Transport paused={props.paused} onPlayback={props.onPlayback} onStep={props.onStep} />
      </div>
      {editor && (
        <MaterialEditor
          material={editor.material}
          catalog={props.materials}
          onCommit={props.onMaterial}
          onClose={closeEditor}
        />
      )}
    </Hardware>
  );
}
