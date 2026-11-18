'use dom';

import type { DOMProps } from 'expo/dom';
import { Hardware } from '@/registry/hardware/ui/hardware';
import { ButtonGroup } from '@/registry/hardware/ui/button-group';
import '../vendor/spec-01/fonts/spec-mono.css';
import './hardware-layout.css';

export default function Transport({
  paused,
  onPlayback,
  onStep,
}: {
  paused: boolean;
  onPlayback: () => Promise<void>;
  onStep: () => Promise<void>;
  dom?: DOMProps;
}) {
  const playback = paused ? 'Play' : 'Stop';
  return (
    <Hardware className="sw-transport">
      <ButtonGroup
        label="Transport"
        parts={[
          {
            label: playback,
            content: (
              <>
                <span aria-hidden>{paused ? '▶' : '■'}</span> {playback}
              </>
            ),
            pressed: !paused,
            onPress: onPlayback,
          },
          {
            label: 'Step',
            content: (
              <>
                <span aria-hidden>▸│</span> Step
              </>
            ),
            disabled: !paused,
            onPress: onStep,
          },
        ]}
      />
    </Hardware>
  );
}
