import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { checkMotionAccess, createMotionInput } from './motion';

const supported = Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV && !Platform.isVision;
const accessStatus = { denied: 'Motion access denied.', unavailable: 'Motion is unavailable.' };

export function usePhoneMotion(
  enabled: boolean,
  setEnabled: (value: boolean) => void,
  playing: boolean,
) {
  const [input] = useState(createMotionInput);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const requesting = useRef(false);
  const mounted = useRef(false);
  const sampling = useRef(false);
  const listening = supported && enabled && active && playing;
  const read = useCallback(
    () => (sampling.current ? input.read(performance.now()) : undefined),
    [input],
  );
  const clear = useCallback(() => input.clear(performance.now()), [input]);

  useEffect(() => {
    if (!supported) return;
    mounted.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      clear();
      setActive(state === 'active');
    });
    return () => {
      mounted.current = false;
      listener.remove();
    };
  }, [clear]);

  useLayoutEffect(() => {
    sampling.current = listening;
    return () => {
      sampling.current = false;
      clear();
    };
  }, [clear, listening]);

  useEffect(() => {
    if (!listening) return;
    let live = true;
    let subscription: ReturnType<typeof DeviceMotion.addListener> | undefined;
    function unavailable(reason: keyof typeof accessStatus) {
      if (!live) return;
      setStatus(accessStatus[reason]);
      setEnabled(false);
    }
    void (async () => {
      try {
        const access = await checkMotionAccess(DeviceMotion, false);
        if (!live || AppState.currentState !== 'active') return;
        if (access !== 'ready') {
          unavailable(access);
          return;
        }
        DeviceMotion.setUpdateInterval(50);
        subscription = DeviceMotion.addListener((sample) => {
          // Core Motion reports seconds since boot. React Native's iOS clock uses Mach uptime in ms.
          if (sampling.current && live && AppState.currentState === 'active')
            input.sample(
              sample,
              sample.accelerationIncludingGravity.timestamp * 1000,
              performance.now(),
            );
        });
      } catch {
        unavailable('unavailable');
      }
    })();
    return () => {
      live = false;
      subscription?.remove();
    };
  }, [input, listening, setEnabled]);

  async function change(next: boolean) {
    if (!supported || requesting.current) return;
    clear();
    setStatus('');
    if (!next) {
      setEnabled(false);
      return;
    }
    requesting.current = true;
    setPending(true);
    try {
      const access = await checkMotionAccess(DeviceMotion, true);
      if (!mounted.current) return;
      if (access === 'ready') setEnabled(true);
      else setStatus(accessStatus[access]);
    } catch {
      if (mounted.current) setStatus(accessStatus.unavailable);
    } finally {
      requesting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return { supported, pending, status, clear, read, change };
}
