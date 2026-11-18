'use dom';
import { useState } from 'react';
import type { DOMProps } from 'expo/dom';
import { Hardware } from '@/registry/hardware/ui/hardware';
import { Tabs } from '@/registry/hardware/ui/tabs';
import { FlatKnob } from '@/registry/hardware/ui/flat-knob';
import { Button } from '@/registry/hardware/ui/button';
import type { Tool, Scene } from './world';
import '../vendor/spec-01/fonts/spec-mono.css';
import './hardware-layout.css';

type Group = 'Materials' | 'Air' | 'Build' | 'World';
type Props = {
  groups: Record<Group, readonly Tool[]>;
  swatches: Record<Tool, string>;
  tool: Tool;
  brush: number;
  scene: Scene;
  overlay: boolean;
  feedback: string;
  resetId: number;
  onTool: (tool: Tool) => Promise<void>;
  onBrush: (radius: number) => Promise<void>;
  onPower: (power: number) => Promise<void>;
  onScene: (scene: Scene) => Promise<void>;
  onOverlay: () => Promise<void>;
  onCategory: () => Promise<void>;
  dom?: DOMProps;
};

export default function HardwareDock(props: Props) {
  const [category, setCategory] = useState<Group>('Materials');
  const [power, setPower] = useState(55);
  const [seenReset, setSeenReset] = useState(props.resetId);
  if (seenReset !== props.resetId) {
    setSeenReset(props.resetId);
    setPower(55);
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
            <span>
              {props.overlay
                ? 'Blue · low     Dark · neutral     Amber · high'
                : 'Painting with ' + props.tool}
            </span>
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
            </>
          )}
        </div>
        <div className="sw-tools">
          {group === 'World' ? (
            <>
              <Button onClick={() => props.onScene(props.scene)}>Reset</Button>
              <Button onClick={() => props.onScene(props.scene === 'Tunnel' ? 'Blank' : 'Tunnel')}>
                {props.scene === 'Tunnel' ? 'Blank canvas' : 'Load tunnel'}
              </Button>
              <Button
                aria-pressed={props.overlay}
                tone={props.overlay ? 'primary' : 'secondary'}
                onClick={props.onOverlay}
              >
                Pressure overlay
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
    <Hardware className="sw-dock">
      <Tabs
        label="Tool categories"
        value={category}
        onValueChange={(next) => {
          setCategory(next as Group);
          void props.onCategory();
        }}
        items={(Object.keys(props.groups) as Group[]).map((group) => ({
          value: group,
          label: group,
          body: controls(group),
        }))}
      />
    </Hardware>
  );
}
