async (page) => {
  const button = (name) => page.getByRole('button', { name, exact: true });
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const board = page.getByTestId('world');
  const brush = page.getByRole('slider', { name: 'Brush size' });
  const inventory = page.getByRole('dialog', { name: 'Material inventory' });
  async function equip(name, replace) {
    await button('Inventory').click();
    await inventory.getByLabel('Search materials').fill(name);
    await inventory.getByRole('region', { name: 'Material catalog' })
      .getByRole('button', { name, exact: true }).click();
    if (replace) {
      await button('Assign').click();
      await button(replace).click();
    }
    await button('Use').click();
    await inventory.waitFor({ state: 'hidden' });
  }
  async function tap(x, y) {
    const r = await board.boundingBox();
    await page.touchscreen.tap(
      r.x + ((x + 0.5) * r.width) / 160,
      r.y + ((y + 0.5) * r.height) / 240,
    );
  }
  await tab('World').click();
  await button('Blank canvas').click();
  await tab('Materials').click();
  await equip('Water', /^Slot 1, Clay dust$/i);
  await button('Water').click();
  await brush.press('Home');
  // Dragging a source must place exactly one emitter, at the initial contact.
  const sourceBox = await board.boundingBox();
  const drag = await page.context().newCDPSession(page);
  try {
    const contact = (x) => ({ x: sourceBox.x + (x + 0.5) * sourceBox.width / 160,
      y: sourceBox.y + 90.5 * sourceBox.height / 240 });
    await drag.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact(22)] });
    await drag.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [contact(60)] });
    await drag.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await drag.detach();
  }
  await brush.press('End');
  await tap(102, 90);
  await brush.press('ArrowDown');
  await tab('Thermal').click();
  await button('Heat').click();
  await button('Heat').click();
  if ((await button('Heat').getAttribute('data-source')) !== 'true')
    throw Error('Repeating Heat did not select its source');
  const thermal = page.getByRole('spinbutton', { name: 'Thermal power' });
  await thermal.press('Home');
  for (let i = 0; i < 25; i++) await thermal.press('ArrowUp');
  await brush.press('Home');
  await tap(22, 30);
  await thermal.press('End');
  await brush.press('End');
  await tap(102, 30);
  await thermal.press('Home');
  await brush.press('ArrowDown');
  await tab('Air').click();
  await button('Fan').click();
  const power = page.getByRole('spinbutton', { name: 'Fan strength' });
  await power.press('Home');
  await tap(22, 174);
  await power.press('End');
  await tap(102, 174);
  await power.press('Home');
  await tab('World').click();
  await button('Save').click();
  await page.getByText('World saved.', { exact: true }).waitFor();
  await page.reload();
  await button('Play').waitFor();
  await tab('Thermal').click();
  await button('Probe').click();
  await button('Step').click();
  await page.getByText('Tick 1', { exact: true }).waitFor();
  const readings = page.getByRole('group', { name: 'Probe readings' });
  async function probe(x, y, name) {
    await tap(x, y);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    return parseFloat(await readings.getByLabel(name, { exact: true }).innerText());
  }
  const small = await probe(22, 30, 'Temperature');
  const large = await probe(102, 30, 'Temperature');
  const smallEdge = await probe(27, 30, 'Temperature');
  const largeEdge = await probe(107, 30, 'Temperature');
  const still = await probe(26, 174, 'Airflow');
  const moving = await probe(106, 174, 'Airflow');
  await tab('World').click();
  await button('Save').click();
  // V3 starts with a 36-byte header and 160 × 240 unsigned 16-bit material IDs.
  const materialCounts = (material) =>
    page.evaluate((material) => {
      const raw = atob(JSON.parse(localStorage.getItem('siftwake.world'))[0].world);
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      if (new DataView(bytes.buffer).getUint32(4) !== 3) throw Error('Expected v3 checkpoint');
      const cells = new Uint16Array(bytes.buffer, 36, 160 * 240);
      const counts = [0, 0];
      cells.forEach((id, i) => {
        if (id === material) counts[Number(i % 160 >= 80)]++;
      });
      return counts;
    }, material);
  const water = await materialCounts(7);
  if (water[0] !== 1 || water[1] !== 6) throw Error('Frozen water outputs: ' + water);
  if (
    !(
      small > 20 &&
      large > 2 * small &&
      largeEdge > smallEdge + 30 &&
      still < 0.1 &&
      moving > still + 0.2
    )
  )
    throw Error(
      'Placed device output after knob changes and restore: ' +
        JSON.stringify({ small, large, smallEdge, largeEdge, still, moving }),
    );
  await button('Reset').click();
  await tab('Materials').click();
  await equip('Sand');
  await brush.press('Home');
  await button('Play').click();
  const rect = await board.boundingBox();
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 8 }],
    });
    const start = Number((await page.getByTestId('tick').innerText()).slice(5));
    await page.waitForFunction(
      (n) => Number(document.querySelector('[data-testid=tick]').textContent.slice(5)) >= n + 15,
      start,
    );
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await touch.detach();
  }
  await button('Stop').click();
  await tab('World').click();
  await button('Save').click();
  const held = (await materialCounts(1)).reduce((a, b) => a + b);
  if (held <= 5) throw Error('A stationary finger only deposited the initial brush stamp');
  for (let i = 0; i < 8; i++) await button('Step').click();
  await button('Save').click();
  const released = (await materialCounts(1)).reduce((a, b) => a + b);
  if (released !== held) throw Error('Brush continued depositing after lift');
  return { small, large, smallEdge, largeEdge, still, moving, water, sandAfterLift: released };
};
