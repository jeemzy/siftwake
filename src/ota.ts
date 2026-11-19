import * as Updates from 'expo-updates';
import { createUpdateCheck } from './updateCheck';
const check = createUpdateCheck({
  check: Updates.checkForUpdateAsync,
  fetch: Updates.fetchUpdateAsync,
});
export async function checkUpdate() {
  return Updates.isEnabled && !__DEV__ && (await check());
}
export function applyUpdate() {
  return Updates.reloadAsync();
}
