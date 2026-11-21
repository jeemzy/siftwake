type Action = () => Promise<void>;

export function SideKey({ label, symbol, disabled, pressed, onPress, title }: {
  label: string;
  symbol: string;
  disabled?: boolean;
  pressed?: boolean;
  onPress: Action;
  title?: string;
}) {
  return (
    <button type="button" className="sw-key" disabled={disabled} aria-pressed={pressed}
      title={title} onClick={() => void onPress()}>
      <span aria-hidden="true">{symbol}</span>
      {label}
      <i aria-hidden="true" data-kit="code-copy" />
    </button>
  );
}

export default function Transport({ paused, onPlayback, onStep }: {
  paused: boolean;
  onPlayback: Action;
  onStep: Action;
}) {
  return (
    <div className="sw-keys" role="group" aria-label="Playback">
      <SideKey label={paused ? 'Play' : 'Stop'} symbol={paused ? '▶' : '■'}
        pressed={!paused} onPress={onPlayback} />
      <SideKey label="Step" symbol="▸│" disabled={!paused} onPress={onStep} />
    </div>
  );
}
