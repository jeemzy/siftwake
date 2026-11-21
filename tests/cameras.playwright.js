// Run against the merged Expo web app.
async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const check = (name) => page.getByRole('checkbox', { name, exact: true });
  const board = page.getByTestId('world');
  const frame = async () => {
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    return board.screenshot();
  };
  async function tap(x, y) {
    const r = await board.boundingBox();
    await page.mouse.click(r.x + ((x + 0.5) * r.width) / 160, r.y + ((y + 0.5) * r.height) / 240);
  }
  const rgb = (image, x, y) =>
    page.evaluate(
      async ([image, x, y]) => {
        const im = new Image();
        im.src = 'data:image/png;base64,' + image;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0);
        return [
          ...ctx.getImageData(
            Math.floor(((x + 0.5) * im.width) / 160),
            Math.floor(((y + 0.5) * im.height) / 240),
            1,
            1,
          ).data,
        ].slice(0, 3);
      },
      [image.toString('base64'), x, y],
    );
  await tab('World').click();
  await button('Blank canvas').click();
  await tab('Air').click();
  await button('Pressure').click();
  await tap(40, 61);
  await button('Suction').click();
  await tap(112, 61);
  await button('Fan').click();
  await tap(80, 120);
  for (let i = 0; i < 8; i++) await button('Step').click();
  await tab('World').click();
  await check('Pressure').click();
  const field = await frame(),
    high = await rgb(field, 45, 61),
    low = await rgb(field, 117, 61);
  if (!(high[0] > high[2] + 15 && low[2] > low[0] + 15))
    throw Error('Pressure pixel signs: ' + [high, low]);
  const combinations = new Set();
  for (let mask = 0; mask < 8; mask++) {
    for (const [bit, name] of ['Pressure', 'Air', 'Heat'].entries()) {
      const enabled = !!(mask & (1 << bit));
      if ((await check(name).isChecked()) !== enabled) await check(name).click();
      if ((await check(name).isChecked()) !== enabled) throw Error('Incorrect toggle ' + name);
    }
    combinations.add((await frame()).toString('base64'));
    if ((await check('Normal').isChecked()) !== (mask === 0))
      throw Error('Normal did not follow layers');
  }
  if (combinations.size !== 8 || (await page.getByTestId('tick').innerText()) !== 'Tick 8')
    throw Error('Missing layer or advanced while paused');
  await check('Normal').click();
  await check('Heat').click();
  await tab('Materials').click();
  await button('Inventory').click();
  const inventory = page.getByRole('dialog', { name: 'Material inventory' });
  await inventory.getByLabel('Search materials').fill('Wood');
  await inventory.getByRole('region', { name: 'Material catalog' })
    .getByRole('button', { name: 'Wood', exact: true }).click();
  await button('Use').click();
  await inventory.waitFor({ state: 'hidden' });
  await tap(80, 80);
  const cold = await rgb(await frame(), 80, 80);
  await tab('Thermal').click();
  await button('Probe').click();
  const readings = page.getByRole('group', { name: 'Probe readings' });
  await readings.waitFor();
  await button('Heat').click();
  await tap(80, 80);
  const hot = await rgb(await frame(), 80, 80);
  if (
    parseFloat(await readings.getByLabel('Temperature', { exact: true }).innerText()) !== 240 ||
    hot[0] < cold[0] + 60
  )
    throw Error('Heat brush/readout mismatch');
  await button('Cool').click();
  await tap(80, 80);
  const cooled = await rgb(await frame(), 80, 80);
  if (parseFloat(await readings.getByLabel('Temperature', { exact: true }).innerText()) !== 120 || cooled[0] >= hot[0])
    throw Error('Cool brush/readout mismatch');
  await button('Probe only').click();
  await button('Close probe').click();
  // Render two otherwise identical fan scenes with opposite jets. Count bright streamline pixels on each side.
  async function jet(turns) {
    await tab('World').click();
    await button('Reset').click();
    await check('Normal').click();
    await check('Air').click();
    await tab('Air').click();
    await button('Fan').click();
    for (let i = 0; i <= turns; i++) await tap(80, 120);
    for (let i = 0; i < 6; i++) await button('Step').click();
    const shot = await frame();
    return page.evaluate(async (data) => {
      const im = new Image();
      im.src = 'data:image/png;base64,' + data;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 240;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, 0, 0, 160, 240);
      const d = ctx.getImageData(0, 0, 160, 240).data;
      const counts = [0, 0];
      for (let y = 113; y < 131; y++)
        for (let x = 30; x < 134; x++)
          if ((x < 72 || x > 91) && d[4 * (x + y * 160) + 1] > 140) counts[Number(x > 91)]++;
      return counts;
    }, shot.toString('base64'));
  }
  const right = await jet(0),
    left = await jet(2);
  if (right[1] <= right[0] || left[0] <= left[1]) throw Error('Fan direction ' + [right, left]);
  return { overlayCombinations: combinations.size, high, low, cold, hot, cooled, right, left };
}
