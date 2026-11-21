// Probe is an inspection mode that can share one canvas contact with a thermal brush.
async (page) => {
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const key = (name) => page.getByRole('button', { name, exact: true });
  const board = page.getByTestId('world');
  const marker = page.getByTestId('probe-marker');
  const readings = page.getByRole('group', { name: 'Probe readings' });
  const temp = readings.getByLabel('Temperature', { exact: true });
  function check(condition, message) { if (!condition) throw Error(message); }

  async function point(x, y) {
    const r = await board.boundingBox();
    return [r.x + (x + 0.5) * r.width / 160, r.y + (y + 0.5) * r.height / 240];
  }
  async function tap(x, y) { await page.mouse.click(...await point(x, y)); }
  async function pinned(x, y) {
    const [cx, cy] = await point(x, y);
    const r = await marker.boundingBox();
    check(r && Math.abs(r.x + r.width / 2 - cx) < 1 &&
      Math.abs(r.y + r.height / 2 - cy) < 1, 'Probe pin missed the contact');
  }
  async function waitTemp(value) {
    await page.waitForFunction((n) =>
      document.querySelector('.sw-readings output[aria-label=Temperature]')?.textContent === n + '°C', value);
  }
  async function checkStillAir() {
    for (const label of ['Pressure', 'Airflow']) {
      const value = parseFloat(await readings.getByLabel(label, { exact: true }).textContent());
      check(value === 0, label + ' changed while heating or cooling open air: ' + value);
    }
  }
  async function checkThermalKey(name, selected, source) {
    const settings = await key(name).evaluate(el => {
      const face = el.querySelector('.sw-lcd-key-face');
      if (!face) throw Error('Thermal key has no inset LCD face');
      const strip = getComputedStyle(el, '::after');
      return {
        selected: el.getAttribute('aria-pressed') === 'true',
        source: el.hasAttribute('data-source'),
        face: getComputedStyle(face).backgroundColor,
        glow: strip.content !== 'none' && strip.content !== 'normal' && Number(strip.opacity) > 0 &&
          strip.display !== 'none' ? [strip.backgroundColor, strip.boxShadow].join(' ') : '',
      };
    });
    check(settings.selected === selected && settings.source === source, name + ' selection or source state');
    const rgb = settings.face.match(/[\d.]+/g).map(Number);
    const ink = selected ? Math.max(...rgb.slice(0, 3)) < 55 :
      rgb[1] > rgb[0] && rgb[1] > rgb[2] && rgb[0] > 70;
    check(ink, name + ' key has the wrong LCD face color: ' + settings.face);
    const color = name === 'Heat' ? 'rgb(242, 174, 88)' : 'rgb(136, 207, 255)';
    check(settings.glow.includes(color) === source, name + ' source glow: ' + settings.glow);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await tab('World').click();
  await key('Blank canvas').click();
  await tab('Thermal').click();
  const thermalPower = page.getByRole('spinbutton', { name: 'Thermal power', exact: true });
  await key('Heat').waitFor();
  await checkThermalKey('Heat', false, false);
  await key('Heat').click();
  await checkThermalKey('Heat', true, false);
  await key('Heat').click();
  await checkThermalKey('Heat', true, true);
  await key('Cool').click();
  await checkThermalKey('Cool', true, false);
  await key('Cool').click();
  await checkThermalKey('Cool', true, true);
  await thermalPower.press('ArrowDown');
  await key('Probe').click();
  await readings.waitFor();
  check(await thermalPower.inputValue() === '99', 'Probe lost the Thermal power setting');
  await thermalPower.press('End');
  await checkThermalKey('Cool', false, false);
  await page.waitForFunction(() => {
    const fields = [...document.querySelectorAll('.sw-readings > div')];
    return fields.length >= 3 && fields.every(field => getComputedStyle(field).opacity === '1');
  });
  check((await readings.locator('output').allTextContents()).every(v => v.startsWith('—')), 'Unexpected initial pin');
  const bounds = await board.boundingBox();
  await tap(0, 0);
  await waitTemp(20);
  await pinned(0, 0);
  await key('Heat').click();
  await checkThermalKey('Heat', true, false);
  await key('Heat').click();
  await checkThermalKey('Heat', true, true);
  await key('Heat').click();
  await pinned(0, 0);
  await tap(159, 239);
  await waitTemp(240);
  await pinned(159, 239);
  await checkStillAir();
  await key('Cool').click();
  await checkThermalKey('Heat', false, false);
  await key('Cool').click();
  await checkThermalKey('Cool', true, true);
  await key('Cool').click();
  await pinned(159, 239);
  await tap(159, 239);
  await waitTemp(120);
  await checkStillAir();
  await key('Probe only').click();
  await tap(159, 239);
  await waitTemp(120);
  await key('Step').click();
  await page.waitForFunction(() => {
    const value = parseInt(document.querySelector('.sw-readings output')?.textContent, 10);
    return value > 20 && value < 120;
  });
  await pinned(159, 239);
  check(JSON.stringify(await board.boundingBox()) === JSON.stringify(bounds), 'Probe resized the canvas');
  await key('Close probe').click();
  await readings.waitFor({ state: 'hidden' });
  await marker.waitFor({ state: 'detached' });
  await key('Probe').click();
  await readings.waitFor();
  await key('Heat').click();
  await key('Probe only').waitFor();
  // Wait for the ordinary autosave while the Thermal tab still owns the screen.
  await page.waitForFunction(() => {
    const row = JSON.parse(localStorage.getItem('siftwake.world') ?? '[]')[0];
    if (!row) return false;
    const { editor } = JSON.parse(row.editor);
    return editor.category === 'Thermal' && editor.tool === 'Heat' && editor.probeMode === true;
  }, undefined, { timeout: 25000 });
  await page.reload();
  await readings.waitFor();
  check((await temp.textContent()).startsWith('—'), 'Reload restored a stale pin');
  await key('Play').click();
  const livePoint = await point(80, 100);
  await page.mouse.move(...livePoint);
  await page.mouse.down();
  try {
    await page.waitForFunction(() => parseInt(document.querySelector('.sw-readings output')?.textContent, 10) > 400);
  } finally {
    await page.mouse.up();
  }
  await key('Stop').click();
  await pinned(80, 100);
  await checkStillAir();
  await key('Step').click();
  await pinned(80, 100);
  await tab('Materials').click();
  await readings.waitFor({ state: 'hidden' });
  await marker.waitFor({ state: 'detached' });
  await tab('Thermal').click();
  await key('Probe').click();
  await readings.waitFor();
  check((await temp.textContent()).startsWith('—'), 'Returning to Thermal kept an old pin');
  await tab('Air').click();
  await readings.waitFor({ state: 'hidden' });
  await tab('World').click();
  await key('Save').click();
  await page.getByText('World saved.', { exact: true }).waitFor();
  const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('siftwake.world'))[0].editor).editor);
  check(saved.category === 'World' && !saved.probeMode && saved.tool !== 'Probe', 'Inspect-only tool leaked to another tab');
  await page.reload();
  await key('Save').waitFor();
  check(await marker.count() === 0 && !await readings.isVisible(), 'World reopened in Probe mode');
  return 'Verified inspect-only, Heat/Cool at the pin, held playback, authored and restored Thermal mode, and clean tab exits.';
};
