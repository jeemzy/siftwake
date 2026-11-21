export type MotionInput = Readonly<{
  gravityX: number;
  gravityY: number;
  shakeX: number;
  shakeY: number;
}>;

type MotionSample = {
  acceleration: { x: number; y: number; z: number } | null;
  accelerationIncludingGravity: { x: number; y: number };
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

const neutral: MotionInput = { gravityX: 0, gravityY: 1, shakeX: 0, shakeY: 0 };
const gravity = 9.80665;
const flatThreshold = 0.12;
const axisNoise = 0.02;
const shakeThreshold = 7;
const shakeDuration = 250;
const staleAfter = 250;

export function createMotionInput() {
  let acceptAfter = -Infinity;
  let latest = -Infinity;
  let filteredX = 0;
  let filteredY = 0;
  let gravityX = 0;
  let gravityY = 1;
  let shakeAt = -Infinity;
  let shakeX = 0;
  let shakeY = 0;
  let depthDirection = 1;

  function clear(now = -Infinity) {
    acceptAfter = now;
    latest = shakeAt = -Infinity;
    filteredX = filteredY = gravityX = shakeX = shakeY = 0;
    gravityY = 1;
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
    const downX = (accelerationIncludingGravity.x - x) / gravity;
    const downY = (y - accelerationIncludingGravity.y) / gravity;
    const force = Math.hypot(x, y, z);
    if (!Number.isFinite(downX) || !Number.isFinite(downY) || !Number.isFinite(force)) return;
    if (capturedAt - latest > staleAfter) clear(acceptAfter);
    const smoothing = latest === -Infinity ? 1 : 0.35;
    filteredX += (downX - filteredX) * smoothing;
    filteredY += (downY - filteredY) * smoothing;
    latest = capturedAt;
    const magnitude = Math.hypot(filteredX, filteredY);
    // When the phone is flat, there is no reliable downhill direction in the screen plane.
    if (magnitude >= flatThreshold) {
      gravityX = Math.abs(filteredX) <= axisNoise ? 0 : filteredX;
      gravityY = Math.abs(filteredY) <= axisNoise ? 0 : filteredY;
      const length = Math.hypot(gravityX, gravityY);
      gravityX /= length;
      gravityY /= length;
    }

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
    return { gravityX, gravityY, shakeX: shakeX * decay || 0, shakeY: shakeY * decay || 0 };
  }

  return { sample, read, clear };
}
