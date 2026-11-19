import type { Loaded, Session } from './checkpoint';
export const persists = false;
export function loadSession(): Loaded {
  return { writable: false };
}
export function saveSession(_session: Session) {}
