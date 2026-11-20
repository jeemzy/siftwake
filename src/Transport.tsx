import { Button } from '@ui-sdk/react/button';

type Props = {
  paused: boolean;
  onPlayback: () => Promise<void>;
  onStep: () => Promise<void>;
};

export default function Transport({ paused, onPlayback, onStep }: Props) {
  return (
    <div className="sw-keys" role="group" aria-label="Playback">
      <Button className="sw-key" aria-pressed={!paused} onClick={() => void onPlayback()}>
        <span aria-hidden>{paused ? '▶' : '■'}</span>
        {paused ? 'Play' : 'Stop'}
        <i aria-hidden data-kit="code-copy" />
      </Button>
      <Button className="sw-key" disabled={!paused} onClick={() => void onStep()}>
        <span aria-hidden>▸│</span>
        Step
        <i aria-hidden data-kit="code-copy" />
      </Button>
    </div>
  );
}
