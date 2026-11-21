export type MotionInput = Readonly<{ tiltX: number; shakeX: number; shakeY: number }>;

type MotionSample = {
  acceleration: { x: number; y: number; z: number } | null;
  accelerationIncludingGravity: { x: number };
};
type Permission = { granted: boolean; canAskAgain: boolean };
type MotionAccess = {
  isAvailableAsync(): Promise<boolean>;
  getPermissionsAsync(): Promise<Permission>;
  requestPermissionsAsync(): Promise<Permission>;
};

export async function checkMotionAccess(sensor: MotionAccess, prompt: boolean) {
  if (!(await sensor.isAvailableAsync())) return 'unavailable';
  const permission = await sensor.getPermissionsAsync();
  if (permission.granted) return 'ready';
  if (prompt && permission.canAskAgain && (await sensor.requestPermissionsAsync()).granted)
    return 'ready';
  return 'denied';
}

const neutral: MotionInput = { tiltX: 0, shakeX: 0, shakeY: 0 };
const gravity = 9.80665;
const deadZone = 0.12;
const fullTilt = 0.65;
const shakeThreshold = 7;
const shakeDuration = 250;
const staleAfter = 250;

export function createMotionInput() {
  let acceptAfter = -Infinity;
  let latest = -Infinity;
  let filteredTilt = 0;
  let tiltX = 0;
  let shakeAt = -Infinity;
  let shakeX = 0;
  let shakeY = 0;
  let depthDirection = 1;

  function clear(now = -Infinity) {
    acceptAfter = now;
    latest = shakeAt = -Infinity;
    filteredTilt = tiltX = shakeX = shakeY = 0;
    depthDirection = 1;
  }

  function sample(
    { acceleration, accelerationIncludingGravity }: MotionSample,
    capturedAt: number,
    deliveredAt = capturedAt,
  ) {
    if (
      !acceleration ||
      !Number.isFinite(capturedAt) ||
      !Number.isFinite(deliveredAt) ||
      capturedAt < acceptAfter ||
      capturedAt <= latest ||
      capturedAt > deliveredAt ||
      deliveredAt - capturedAt > staleAfter
    )
      return;
    const { x, y, z } = acceleration;
    const lean = (accelerationIncludingGravity.x - x) / gravity;
    const force = Math.hypot(x, y, z);
    if (!Number.isFinite(lean) || !Number.isFinite(force)) return;
    if (capturedAt - latest > staleAfter) clear(acceptAfter);
    filteredTilt = latest === -Infinity ? lean : filteredTilt + (lean - filteredTilt) * 0.35;
    latest = capturedAt;
    tiltX =
      Math.sign(filteredTilt) *
      Math.min(1, Math.max(0, (Math.abs(filteredTilt) - deadZone) / (fullTilt - deadZone)));

    if (force < shakeThreshold || capturedAt - shakeAt < shakeDuration) return;
    const strength = Math.min(1, 0.35 + (force - shakeThreshold) * 0.06);
    const planar = Math.hypot(x, y);
    // Materials lag behind the phone. Phone Y increases toward the top of the screen.
    if (planar >= force * 0.25) {
      shakeX = (-x / planar) * strength;
      shakeY = (y / planar) * strength;
    } else {
      // Shakes straight through the screen still give the material a visible jolt.
      shakeX = depthDirection * strength;
      shakeY = 0;
      depthDirection = -depthDirection;
    }
    shakeAt = capturedAt;
  }

  function read(now: number): MotionInput {
    if (now - latest > staleAfter) return neutral;
    const decay = Math.max(0, 1 - Math.max(0, now - shakeAt) / shakeDuration);
    return { tiltX: tiltX || 0, shakeX: shakeX * decay || 0, shakeY: shakeY * decay || 0 };
  }

  return { sample, read, clear };
}
