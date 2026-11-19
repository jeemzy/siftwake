type Transport = {
  check: () => Promise<{ isAvailable: boolean; isRollBackToEmbedded: boolean }>;
  fetch: () => Promise<{ isNew: boolean; isRollBackToEmbedded: boolean }>;
};
export function createUpdateCheck(transport: Transport, now = Date.now) {
  let busy = false,
    last = -Infinity,
    ready = false;
  return async () => {
    if (busy || ready || now() - last < 60_000) return ready;
    busy = true;
    last = now();
    try {
      const available = await transport.check();
      if (available.isAvailable || available.isRollBackToEmbedded) {
        const result = await transport.fetch();
        ready = result.isNew || result.isRollBackToEmbedded;
      }
    } catch {
      /* Offline and interrupted downloads leave the running world intact. */
    } finally {
      busy = false;
    }
    return ready;
  };
}
