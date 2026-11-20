// Exercise the same exported web game as the iOS bundle's simulation and DOM controls.
async (page) => {
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const key = (name) => page.getByRole('button', { name, exact: true });
  const board = page.getByTestId('world');
  const read = () => page.locator('.sw-readings output').allTextContents();
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  async function tap(x, y) {
    const r = await board.boundingBox();
    await page.mouse.click(r.x + ((x + 0.5) * r.width) / 160, r.y + ((y + 0.5) * r.height) / 240);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('Thermal').click();
  await key('Heat').click();
  await tap(29, 61);
  for (let i = 0; i < 12; i++) await key('Step').click();
  await page.getByText('Tick 12', { exact: true }).waitFor();
  const before = await board.boundingBox();
  // Collect frames inside the browser so a slow automation round trip cannot skip the slide.
  await key('Probe').evaluate(async (button) => {
    button.click();
    const surface = document.querySelector('[data-testid=world]');
    const cartridge = document.querySelector('.sw-cartridge');
    const readings = document.querySelector('.sw-readings');
    window.probeFrames = [];
    const start = performance.now();
    for (;;) {
      await new Promise(requestAnimationFrame);
      const { x, y, width, height } = surface.getBoundingClientRect();
      const travel = new DOMMatrixReadOnly(getComputedStyle(cartridge).transform).m42;
      window.probeFrames.push({
        x,
        y,
        width,
        height,
        travel,
        light: Number(getComputedStyle(readings, '::before').opacity),
      });
      if (performance.now() - start > 560) break;
    }
  });
  const frames = await page.evaluate(() => window.probeFrames);
  check(
    frames.every((f) => ['x', 'y', 'width', 'height'].every((k) => f[k] === before[k])),
    'Canvas moved during travel',
  );
  check(
    frames.some((f) => f.travel > 0 && f.travel < 65),
    'Missing cartridge travel',
  );
  check(
    frames.every((f) => f.travel < 0.1 || f.light === 0),
    'Backlight came on before seating',
  );
  check(frames.at(-1).light === 1 && frames.at(-1).travel === 0, 'Display did not power up');
  check(
    (await read()).every((v) => v.startsWith('—')),
    'Unexpected initial sample',
  );
  await tap(29, 61);
  check(
    JSON.stringify(await read()) === JSON.stringify(['155°C', '+0.01sim', '1.54E']),
    'Incorrect tunnel probe at tick 12: ' + (await read()),
  );
  await key('Step').click();
  await page.waitForFunction(
    () => document.querySelector('.sw-readings output').textContent !== '155°C',
  );
  await key('Play').click();
  check(await key('Step').isDisabled(), 'Step enabled during playback');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid=tick]').textContent.slice(5)) > 22,
  );
  await key('Stop').click();
  await tab('World').click();
  for (const layer of ['Heat', 'Air', 'Pressure'])
    await page.getByRole('checkbox', { name: layer, exact: true }).click();
  check(
    await page.getByRole('group', { name: 'Probe readings' }).isVisible(),
    'Changing categories hid the probe',
  );
  await key('Blank canvas').click();
  await tab('Thermal').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await key('Heat').click();
  await page.setViewportSize({ width: 320, height: 568 });
  await tap(0, 0);
  await tap(159, 239);
  const narrow = await board.boundingBox();
  const painted = await board.screenshot();
  await key('Probe').click();
  check(
    await page
      .locator('.sw-cartridge')
      .evaluate((e) => getComputedStyle(e).transitionDuration === '0s'),
    'Reduced motion slide',
  );
  for (const [x, y] of [
    [0, 0],
    [159, 239],
  ]) {
    await tap(x, y);
    check(
      JSON.stringify(await read()) === JSON.stringify(['240°C', '0.00sim', '0.00']),
      'Wrong corner or still-air reading: ' + (await read()),
    );
    const marker = await page.getByTestId('probe-marker').boundingBox();
    check(
      Math.abs(marker.x + marker.width / 2 - narrow.x - ((x + 0.5) * narrow.width) / 160) < 1,
      'Marker x',
    );
    check(
      Math.abs(marker.y + marker.height / 2 - narrow.y - ((y + 0.5) * narrow.height) / 240) < 1,
      'Marker y',
    );
  }
  await key('Cool').click();
  check(painted.equals(await board.screenshot()), 'Probing changed the paused canvas');
  check(
    JSON.stringify(await board.boundingBox()) === JSON.stringify(narrow),
    'Narrow canvas shifted',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await key('Probe').click();
  await key('Heat').click();
  await page.waitForTimeout(360);
  check(
    await page
      .locator('.sw-readings')
      .evaluate((e) => getComputedStyle(e, '::before').opacity === '0'),
    'Hidden display lit',
  );
  return 'Numbers, motion order, fixed bounds, corner taps, overlays, playback and reduced motion passed.';
};
