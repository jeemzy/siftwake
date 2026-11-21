// Replay the exported engine through Step and compare its complete saved state.
async (page, legacy, legacyV2) => {
  const button = (name) => page.getByRole('button', { name, exact: true });
  const tick = (n) => page.getByText('Tick ' + n, { exact: true }).waitFor();
  const key = 'siftwake.world';
  const read = () => page.evaluate((key) => localStorage.getItem(key), key);
  async function restore(rows) {
    await page.evaluate(([key, rows]) => localStorage.setItem(key, rows), [key, rows]);
    await page.reload();
    await button('Play').waitFor();
  }
  // Waiting for each rendered tick catches skipped and double steps as well as a stale save.
  async function advance(from, count) {
    for (let n = from + 1; n <= from + count; n++) {
      await button('Step').click();
      await tick(n);
    }
  }
  const worldTab = page.getByRole('tab', { name: 'World', exact: true });
  const board = page.getByTestId('world');
  for (const [i, material] of ['Slush', 'Plaster', 'Tin', 'Seed'].entries()) {
    await button('Inventory').click();
    const inventory = page.getByRole('dialog', { name: 'Material inventory' });
    await inventory.getByLabel('Search materials').fill(material);
    await inventory
      .getByRole('region', { name: 'Material catalog' })
      .getByRole('button', { name: material, exact: true })
      .click();
    await button('Use').click();
    await inventory.waitFor({ state: 'hidden' });
    const rect = await board.boundingBox();
    await page.mouse.click(
      rect.x + ((30 + i * 24) * rect.width) / 160,
      rect.y + (16 * rect.height) / 240,
    );
  }
  await worldTab.click();
  await button('Save').click();
  const painted = Buffer.from(JSON.parse(await read())[0].world, 'base64');
  // Read the center pixel of each stroke before movement or phase changes can alter it.
  for (const [i, id] of [257, 272, 280, 290].entries()) {
    const center = 30 + i * 24 + 160 * 16;
    if (painted.readUInt16LE(36 + 2 * center) !== id)
      throw Error('Pack brush did not paint ID ' + id);
  }
  await advance(0, 5);
  await button('Save').click();
  const start = await read();
  await advance(5, 100);
  await button('Save').click();
  const first = JSON.parse(await read())[0];
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const cartridge = document.querySelector('[aria-label="Tool cartridge"][data-power="on"]');
      if (cartridge) {
        window.firstCartridge = cartridge.dataset.screen;
        observer.disconnect();
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true });
  });
  await restore(start);
  await tick(5);
  await page.locator('[role="region"][aria-label="Tool cartridge"][data-power="on"][data-screen="World"]').waitFor();
  if ((await page.evaluate(() => window.firstCartridge)) !== 'World' ||
      (await worldTab.getAttribute('aria-selected')) !== 'true')
    throw Error('Restored World cartridge and selected category disagree');
  await advance(5, 100);
  await button('Save').click();
  const second = JSON.parse(await read())[0];
  if (second.world !== first.world || second.editor !== first.editor)
    throw Error('The saved tunnel diverged during the 100-tick replay');

  // Every saved category should mount its own screen on the first illuminated frame.
  for (const [category, tool, keyName] of [
    ['Materials', 274, 'Inventory'],
    ['Air', 'Fan', 'Fan'],
    ['Build', 'Wall', 'Wall'],
    ['Thermal', 'Heat', 'Probe'],
    ['Thermal', 'Probe', 'Close probe'],
  ]) {
    const metadata = JSON.parse(second.editor);
    Object.assign(metadata.editor, { category, tool, probeMode: tool === 'Probe', sourceMode: false });
    await restore(JSON.stringify([{ ...second, editor: JSON.stringify(metadata) }]));
    const screen = tool === 'Probe' ? 'Probe' : category;
    const cartridge = page.getByRole('region', { name: 'Tool cartridge' });
    await cartridge.getByRole('button', { name: keyName, exact: true }).waitFor();
    const firstScreen = await page.evaluate(() => window.firstCartridge);
    if (firstScreen !== screen) throw Error('First cartridge was ' + firstScreen + ' for saved ' + screen);
  }

  // A truncated world followed by a genuine 0.3.0 world must open the latter read-only.
  const oldEditor = JSON.stringify({
    version: 1,
    editor: {
      scene: 'Blank',
      tool: 'Wood',
      brush: 1,
      category: 'World',
      camera: { Heat: false, Air: false, Pressure: false },
    },
  });
  const rows = JSON.stringify([
    { ...second, world: 'U0lGVAAAAAE=' },
    { world: legacy, editor: oldEditor },
  ]);
  await restore(rows);
  await tick(2);
  await page
    .getByText('Opened the previous world. The newer save is preserved.', { exact: true })
    .waitFor();
  await advance(2, 1);
  await button('Save').click();
  await page.getByText('Saved world is read-only.', { exact: true }).waitFor();
  if ((await read()) !== rows) throw Error('Recovery changed one of the stored generations');
  await restore(
    JSON.stringify([
      {
        world: legacyV2,
        editor: JSON.stringify({
          version: 1,
          editor: { ...JSON.parse(oldEditor).editor, tool: 255, category: 'Materials' },
        }),
      },
    ]),
  );
  await button('Inventory').click();
  const inventory = page.getByRole('dialog', { name: 'Material inventory' });
  await inventory.getByLabel('Search materials').fill('Snow');
  const snow = inventory.getByRole('region', { name: 'Material catalog' })
    .getByRole('button', { name: 'Snow', exact: true });
  await snow.waitFor();
  await button('Close inventory').click();
  await inventory.waitFor({ state: 'hidden' });
  await worldTab.click();
  await button('Save').click();
  await page.getByText('World saved.', { exact: true }).waitFor();
  const [migrated] = JSON.parse(await read());
  const settings = JSON.parse(migrated.editor).editor;
  if (
    Buffer.from(migrated.world, 'base64').readUInt32BE(4) !== 3 ||
    settings.tool !== 255 ||
    JSON.stringify(settings.hotbar) !== '[1,7,2,3,4,5]' ||
    settings.sourceMode ||
    settings.thermalPower !== 100
  )
    throw Error('Saved migration did not retain the expected v3 defaults');
  const beforeFailure = await read();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === 'siftwake.world')
        throw new DOMException('Storage is full', 'QuotaExceededError');
      return write.call(this, name, value);
    };
  });
  await button('Step').click();
  await button('Save').click();
  await page.getByText('World could not be saved.', { exact: true }).waitFor();
  if ((await read()) !== beforeFailure)
    throw Error('Failed browser save altered existing generations');
  return 'All four packs replayed 100 ticks identically. Recovered the v1 fallback, migrated v2 custom Snow at ID 255 and preserved both slots on a storage failure.';
};
