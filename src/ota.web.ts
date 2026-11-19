export async function checkUpdate() {
  return false;
}
export async function applyUpdate() {
  throw Error('Updates apply to the installed iPhone game');
}

export const updateLabel = '';
