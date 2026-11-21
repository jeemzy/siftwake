import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './inventory-motion.css';
import { Button } from '@/registry/hardware/ui/button';
import { builtinMaterials, families, M, type Material } from './materials';

export type InventoryEntry = Pick<Material, 'id' | 'name' | 'family' | 'color'> & {
  group: string;
  tip: string;
  sourceEligible: boolean;
  reactions?: string[];
};

export function catalogEntries(custom: readonly Material[]): readonly InventoryEntry[] {
  const names = new Map([...builtinMaterials, ...custom].map((item) => [item.id, item.name]));
  function result(id: number | null, original: number) {
    return id === M.Empty ? 'empty space' : names.get(id ?? original);
  }
  const reactions = new Map<number, string[]>();
  for (const item of custom) {
    for (const rule of item.rules) {
      const conditions = [
        [rule.minTemperature, 'T ≥', '°C'], [rule.maxTemperature, 'T ≤', '°C'],
        [rule.minPressure, 'P ≥', 'sim'], [rule.maxPressure, 'P ≤', 'sim'],
      ].filter(([value]) => value !== undefined).map(([value, sign, unit]) => `${sign} ${value} ${unit}`);
      const heat = rule.heatExchange ? ` · ΔT ${rule.heatExchange > 0 ? '+' : ''}${rule.heatExchange} °C` : '';
      const text = `${item.name} + ${names.get(rule.with)} → ${result(rule.own, item.id)} + ${result(rule.other, rule.with)}` +
        (conditions.length ? ' · ' + conditions.join(', ') : '') + heat;
      for (const id of new Set([item.id, rule.with])) {
        if (!reactions.has(id)) reactions.set(id, []);
        reactions.get(id)!.push(text);
      }
    }
  }
  const entries = [...builtinMaterials, ...custom.map((item) => ({
    ...item, group: 'Custom', sourceEligible: item.family !== 'solid',
    tip: item.rules.length ? `Paint a little beside ${names.get(item.rules[0].with)} to test its contact rule.`
      : `Paint this ${families[item.family].toLowerCase()} with the brush.`,
  }))];
  return entries.map((entry) => ({ ...entry, reactions: reactions.get(entry.id) }));
}

type Props = {
  open: boolean;
  visible: boolean;
  viewportHeight?: number;
  hostReady: boolean;
  children?: ReactNode;
  entries: readonly InventoryEntry[];
  slots: readonly (number | null)[];
  equipped: number | undefined;
  sourceMode: boolean;
  onNew: () => void;
  onEdit: (id: number) => void;
  onPlayKey: (id: number) => void;
  onUse: (id: number) => Promise<void>;
  onChange: (slots: (number | null)[]) => Promise<void>;
  onVisibility: (open: boolean) => Promise<void>;
};

type Phase = 'docked' | 'preparing' | 'opening' | 'open' | 'closing';
const travelTime = 640;

// A single timeline drives the sheet and carrier. The carrier waits in its
// socket until the sheet reaches it, then both travel the remaining distance.
function sheetMotion(sheet: HTMLElement, carrier: HTMLElement, socket: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dock = socket.getBoundingClientRect();
  const header = carrier.getBoundingClientRect();
  const toSocket = Math.max(0, dock.top - header.top);
  const belowScreen = Math.max(toSocket + 1, window.innerHeight - sheet.getBoundingClientRect().top + 2);
  const pickup = 1 - toSocket / belowScreen;
  const x = dock.left - header.left;
  const scale = dock.width / header.width;
  const timing: KeyframeAnimationOptions = { duration: travelTime, easing: 'cubic-bezier(.28,.15,.24,1)', fill: 'both' };
  const sheetTravel = sheet.animate([
    { transform: `translateY(${belowScreen}px)` },
    { transform: `translateY(${toSocket}px)`, offset: pickup },
    { transform: 'translateY(0px)' },
  ], timing);
  // Cancel the parent's translation until its header is level with the socket.
  const carrierTravel = carrier.animate([
    { transform: `translate(${x}px, ${toSocket - belowScreen}px) scaleX(${scale})` },
    { transform: `translate(${x}px, 0px) scaleX(${scale})`, offset: pickup },
    { transform: 'translate(0px, 0px) scaleX(1)' },
  ], timing);
  return [sheetTravel, carrierTravel];
}

function ComposeIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <path d="M12.5 3.5H4.5v17h14v-7M7.5 8h4M7.5 11h2" />
    <path d="m11 17 1-4 7.7-7.7 3 3-7.7 7.7-4 1Zm6.8-9.8 3 3" />
  </svg>;
}

export default function Inventory(props: Props) {
  const { entries, slots } = props;
  const [phase, setPhase] = useState<Phase>('docked');
  const phaseRef = useRef<Phase>('docked');
  const open = phase !== 'docked' && phase !== 'preparing';
  const closing = phase === 'closing';
  const canDismiss = phase !== 'docked' && !closing;
  const callbacks = useRef(props);
  useLayoutEffect(() => { callbacks.current = props; });
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const groups = useMemo(() => Array.from(new Set(entries.map((entry) => entry.group))), [entries]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [inspected, inspect] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const socket = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const carrier = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hold = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const animation = useRef<Animation[] | undefined>(undefined);
  const visibilityActions = useRef(Promise.resolve());
  const awaitingHost = useRef<boolean | undefined>(undefined);
  const item = inspected === null ? undefined : byId.get(inspected);
  const filtered = entries.filter((entry) => (!group || entry.group === group) &&
    entry.name.toLowerCase().includes(search.trim().toLowerCase()));

  function stopHold() {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  useEffect(() => stopHold, []);
  function move(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }
  function notifyHost(value: boolean) {
    if (awaitingHost.current === undefined && callbacks.current.open === value) return;
    awaitingHost.current = value;
    visibilityActions.current = visibilityActions.current
      .then(() => callbacks.current.onVisibility(value))
      .catch(() => {
        if (value && phaseRef.current === 'preparing') move('docked');
        setStatus('Inventory host could not change. Try again.');
      });
  }
  function settle() {
    if (phaseRef.current === 'closing') {
      move('docked');
      notifyHost(false);
    } else if (phaseRef.current === 'opening') move('open');
  }
  function playMotion() {
    const current = animation.current;
    const direction = phaseRef.current;
    if (direction !== 'opening' && direction !== 'closing') return;
    if (!current) { settle(); return; }
    const clock = current[0];
    const time = Number(clock.currentTime);
    if ((direction === 'closing' && time <= 0) || (direction === 'opening' && time >= travelTime)) {
      settle();
      return;
    }
    clock.onfinish = () => {
      if (animation.current === current && phaseRef.current === direction) settle();
    };
    const rate = direction === 'opening' ? 1 : -1;
    const now = document.timeline.currentTime;
    for (const part of current) {
      part.playbackRate = rate;
      part.play();
      if (typeof now === 'number') part.startTime = now - time / rate;
    }
  }
  useLayoutEffect(() => {
    const dialog = panel.current!;
    if (!open) {
      dialog.close();
      dialog.setAttribute('open', '');
      opener.current?.focus({ preventScroll: true });
      opener.current = null;
      return;
    }
    dialog.close();
    dialog.showModal();
    toggle.current?.focus({ preventScroll: true });
    const setup = () => {
      const time = Number(animation.current?.[0].currentTime ?? (phaseRef.current === 'open' ? travelTime : 0));
      animation.current?.forEach(part => part.cancel());
      const current = sheetMotion(sheet.current!, carrier.current!, socket.current!);
      animation.current = current;
      current?.forEach(part => {
        part.pause();
        part.currentTime = Math.min(travelTime, Math.max(0, time));
      });
      playMotion();
    };
    setup();
    window.addEventListener('resize', setup);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', setup);
    return () => {
      window.removeEventListener('resize', setup);
      preference.removeEventListener('change', setup);
      animation.current?.forEach(part => part.cancel());
      animation.current = undefined;
      stopHold();
    };
  }, [open]);
  useLayoutEffect(() => { playMotion(); }, [phase]);

  // Native confirms the touch clip is open. Measure travel in the DOM itself:
  // WKWebView's content viewport can be inset from the native layout rectangle.
  useLayoutEffect(() => {
    if (phase !== 'preparing' || !props.open || !props.hostReady) return;
    const target = props.viewportHeight;
    function ready() {
      if (phaseRef.current !== 'preparing' || !target || !socket.current) return;
      const dock = socket.current.closest<HTMLElement>('.sw-dock');
      if (dock && target > dock.offsetHeight && dock.getBoundingClientRect().top <= 0) return;
      move('opening');
    }
    ready();
    window.addEventListener('resize', ready);
    return () => window.removeEventListener('resize', ready);
  }, [phase, props.open, props.hostReady, props.viewportHeight]);

  function show(from = toggle.current) {
    if (phaseRef.current === 'docked') {
      opener.current = from;
      inspect(props.equipped ?? entries[0]?.id ?? null);
      setSearch('');
      setGroup('');
      cancel(false);
      move(props.viewportHeight === undefined ? 'opening' : 'preparing');
      notifyHost(true);
      return;
    }
    if (phaseRef.current === 'closing') move('opening');
  }
  // The host can also open or dismiss the inventory independently of a key.
  const lastHost = useRef(false);
  useLayoutEffect(() => {
    if (props.open === lastHost.current) return;
    lastHost.current = props.open;
    if (awaitingHost.current !== undefined) {
      if (props.open === awaitingHost.current) awaitingHost.current = undefined;
      return;
    }
    if (props.open && phaseRef.current === 'docked') show();
    if (!props.open && phaseRef.current !== 'docked') close();
  }, [props.open]);

  function cancel(restore = true) {
    stopHold();
    setPending(null);
    setHighlight(null);
    setStatus('');
    if (restore) origin.current?.focus({ preventScroll: true });
  }
  function close(useId?: number) {
    if (phaseRef.current === 'closing' || phaseRef.current === 'docked') return;
    if (phaseRef.current === 'preparing') {
      move('docked');
      notifyHost(false);
      return;
    }
    if (useId !== undefined) void props.onUse(useId);
    cancel(false);
    move('closing');
  }
  function assign(id: number, from: HTMLElement) {
    inspect(id);
    origin.current = from;
    const bound = slots.indexOf(id);
    const empty = slots.indexOf(null);
    if (bound >= 0 || empty >= 0) {
      const index = bound >= 0 ? bound : empty;
      if (bound < 0) void props.onChange(slots.map((old, i) => i === index ? id : old));
      setPending(null);
      setHighlight(index);
      setStatus(`${byId.get(id)?.name} is in slot ${index + 1}.`);
    } else {
      setHighlight(null);
      setPending(id);
      setStatus(`Replace a slot with ${byId.get(id)?.name}.`);
      row.current?.querySelector('button')?.focus({ preventScroll: true });
    }
  }
  function keyPress(index: number) {
    if (phaseRef.current === 'preparing') return;
    const id = slots[index];
    if (!open) {
      if (id !== null) props.onPlayKey(id);
      else show(row.current?.querySelectorAll('button')[index]);
      return;
    }
    if (phaseRef.current === 'closing') return;
    if (pending !== null) {
      void props.onChange(slots.map((old, i) => i === index ? pending : old));
      setStatus(`Slot ${index + 1} now holds ${byId.get(pending)?.name}.`);
      setPending(null);
      setHighlight(null);
      origin.current?.focus({ preventScroll: true });
    } else {
      inspect(id);
      setHighlight(index);
      setStatus(id === null ? `Slot ${index + 1} is empty.` : '');
    }
  }

  return (
    <div className="sw-inventory-socket" ref={socket}>
      <dialog ref={panel} className="sw-inventory sw-sliding-inventory" data-open={open} data-phase={phase}
        role={open ? 'dialog' : 'group'} aria-label={open ? 'Material inventory' : props.visible ? 'Material hotbar' : 'Tool keys'}
        onCancel={(event) => {
          event.preventDefault();
          if (pending !== null) cancel(); else void close();
        }}>
        <div className="sw-inventory-sheet" ref={sheet}>
          <div className="sw-slot-carrier sw-lcd-shell" ref={carrier}>
            <div className="sw-slot-glass sw-lcd-pane" hidden={!open && !props.visible}>
              <div ref={row} className="sw-hotbar" role="group" aria-label="Hotbar slots"
                data-replace={pending !== null || undefined}>
                {slots.map((id, index) => {
                  const entry = id === null ? undefined : byId.get(id);
                  const selected = id !== null && id === props.equipped;
                  return <button key={index} type="button" className="sw-lcd-key"
                    style={{
                      '--sw-key-fill': entry ? `color-mix(in srgb, ${entry.color} 40%, #b8c5aa)` : undefined,
                      '--sw-source-color': entry?.color,
                    } as CSSProperties}
                    data-selected={selected || undefined} data-source={selected && props.sourceMode || undefined}
                    aria-description={selected && props.sourceMode ? 'Place source' : undefined}
                    data-highlight={open && highlight === index || undefined}
                    aria-label={open ? `Slot ${index + 1}, ${entry?.name ?? 'empty'}` : entry?.name ?? `Empty slot ${index + 1}`}
                    aria-pressed={open ? highlight === index : selected}
                    title={entry?.name} onClick={() => keyPress(index)}>
                    <span className="sw-lcd-key-face"><span className="sw-slot-name">{entry?.name ?? '—'}</span></span>
                  </button>;
                })}
              </div>
              <button className="sw-inventory-key sw-lcd-key" ref={toggle} type="button"
                aria-haspopup="dialog" aria-expanded={open && !closing}
                aria-label={canDismiss ? 'Close inventory' : 'Inventory'}
                onClick={() => phaseRef.current === 'closing' || phaseRef.current === 'docked' ? show() : close()}>
                <span className="sw-lcd-key-face">
                  {canDismiss ? <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
                    <path d="m2 6 7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  </svg> : <span className="sw-pixel-grid" aria-hidden />}
                </span>
              </button>
            </div>
            {!open && !props.visible && props.children}
          </div>
          {open && <>
            <div className="sw-inventory-status">
              <span role="status">{status}</span>
              {pending !== null && <Button onClick={() => cancel()}>Cancel</Button>}
            </div>
            <div className="sw-inventory-screen" inert={closing}
              onScrollCapture={() => { stopHold(); if (pending !== null) cancel(); }}>
              <div className="sw-inventory-filters">
                <input type="search" aria-label="Search materials" placeholder="Search"
                  value={search} onChange={(event) => { cancel(false); setSearch(event.target.value); }} />
                <select aria-label="Material group" value={group}
                  onChange={(event) => { cancel(false); setGroup(event.target.value); }}>
                  <option value="">All groups</option>
                  {groups.map((label) => <option key={label}>{label}</option>)}
                </select>
              </div>
              <div className="sw-catalog" aria-label="Material catalog" role="region" tabIndex={0}
                onPointerCancel={stopHold} onPointerUp={stopHold}>
                {!filtered.length && <p role="status">No matching materials.</p>}
                {groups.map((label) => {
                  const rows = filtered.filter((entry) => entry.group === label);
                  return rows.length > 0 && <section key={label} aria-label={label}>
                    <h3>{label}</h3>
                    <div className="sw-catalog-grid">{rows.map((entry) =>
                      <button type="button" key={entry.id} aria-pressed={entry.id === inspected}
                        onContextMenu={(event) => event.preventDefault()}
                        onPointerDown={(event) => {
                          if (!event.isPrimary || event.button !== 0) return;
                          stopHold();
                          const target = event.currentTarget;
                          const gesture = { x: event.clientX, y: event.clientY, fired: false };
                          hold.current = gesture;
                          timer.current = setTimeout(() => {
                            gesture.fired = true;
                            assign(entry.id, target);
                          }, 500);
                        }}
                        onPointerMove={(event) => {
                          const press = hold.current;
                          if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) stopHold();
                        }}
                        onPointerLeave={stopHold}
                        onClick={(event) => {
                          if (event.detail && hold.current?.fired) { hold.current = null; return; }
                          cancel(false);
                          inspect(entry.id);
                        }}>
                        <i aria-hidden style={{ background: entry.color }} />
                        {entry.name}
                      </button>)}</div>
                  </section>;
                })}
              </div>
              {item && <section className="sw-inspector" aria-label="Material details">
                <div className="sw-inspector-copy" tabIndex={0} aria-live="polite" aria-atomic="true">
                  <h3>{item.name} <small>{families[item.family]}</small></h3>
                  <p><strong>Try this</strong> {item.tip}</p>
                  {!!item.reactions?.length && <ul aria-label="Contact reactions">
                    {item.reactions.map((reaction) => <li key={reaction}>{reaction}</li>)}
                  </ul>}
                </div>
                <div className="sw-inventory-actions">
                  <Button tone="primary" onClick={() => void close(item.id)}>Use</Button>
                  <Button onClick={(event) => assign(item.id, event.currentTarget)}>Assign</Button>
                  {item.group === 'Custom' && <Button aria-label="Edit material"
                    onClick={() => { cancel(false); props.onEdit(item.id); }}>Edit</Button>}
                  {slots.includes(item.id) && <Button onClick={() => {
                    const index = slots.indexOf(item.id);
                    void props.onChange(slots.map((old, i) => i === index ? null : old));
                    setPending(null);
                    setHighlight(index);
                    setStatus(`Slot ${index + 1} cleared.`);
                    row.current?.querySelectorAll('button')[index]?.focus({ preventScroll: true });
                  }}>Clear slot</Button>}
                </div>
              </section>}
            </div>
            <Button className="sw-compose-key" tone="primary" aria-label="New material" title="New material"
              disabled={closing} onClick={() => { cancel(false); props.onNew(); }}><ComposeIcon /></Button>
          </>}
        </div>
      </dialog>
    </div>
  );
}
