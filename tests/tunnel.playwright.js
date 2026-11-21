// Run with playwright-cli run-code --filename tests/tunnel.playwright.js.
async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.reload();
  const button = (name) => page.getByRole('button', { name, exact: true });
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const canvas = page.getByTestId('world');
  const tick = page.getByTestId('tick');
  await button('Step').waitFor();
  const cartridge = page.getByRole('region', { name: 'Tool cartridge' });
  const categories = ['Materials', 'Air', 'Build', 'Thermal', 'World'];
  const powered = (screen) => page.locator(
    '[aria-label="Tool cartridge"][data-power="on"][data-screen="' + screen + '"]',
  );
  await powered('Materials').waitFor();
  for (const [i, name] of ['Clay Dust', 'Baking Soda', 'Vinegar', 'Copper', 'Wax', 'Flame', 'Inventory'].entries()) {
    const key = cartridge.getByRole('button').nth(i);
    if ((await key.getAttribute('aria-label'))?.toLowerCase() !== name.toLowerCase())
      throw Error('Unexpected initial key at position ' + (i + 1));
  }
  // Observe power changes from before each real category press, including the return to Materials.
  for (const next of [...categories.slice(1), categories[0]]) {
    await cartridge.evaluate((element) => {
      window.cartridgeDimming = new Promise((resolve) => {
        const glass = element.querySelector('.sw-glass');
        let darkest = 0;
        const previous = element.dataset.screen;
        let frame;
        const sample = () => {
          darkest = Math.max(darkest, Number(getComputedStyle(glass, '::after').opacity));
          if (element.dataset.screen !== previous && element.dataset.power === 'on') {
            resolve(darkest);
          } else {
            frame = requestAnimationFrame(sample);
          }
        };
        const observer = new MutationObserver(() => {
          if (element.dataset.power === 'off') {
            observer.disconnect();
            frame = requestAnimationFrame(sample);
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-power'] });
        setTimeout(() => { observer.disconnect(); cancelAnimationFrame(frame); resolve(darkest); }, 1500);
      });
    });
    await tab(next).click();
    await powered(next).waitFor();
    const knobs = await page.getByRole('spinbutton').evaluateAll(controls =>
      controls.map(control => control.getAttribute('aria-label')));
    const expectedKnob = next === 'Thermal' ? 'Thermal power' : next === 'Air' ? 'Fan strength' : '';
    if (knobs.join(',') !== expectedKnob) throw Error('Unexpected knobs on ' + next + ': ' + knobs);
    await page.getByRole('slider', { name: 'Brush size', exact: true }).waitFor();
    if (await page.evaluate(() => window.cartridgeDimming) < 0.5)
      throw Error('Cartridge did not visibly dim while switching to ' + next);
  }
  const agitate = button('Agitate');
  const leftKey = await agitate.boundingBox();
  const rightKey = await button('Play').boundingBox();
  if (leftKey.x + leftKey.width >= rightKey.x || !await agitate.isDisabled())
    throw Error('Paused Agitate key placement or state');
  const initial = await canvas.screenshot();
  await button('Step').click();
  await page.getByText('Tick 1', { exact: true }).waitFor();
  await button('Play').click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid=tick]').textContent.split(' ')[1]) >= 12,
  );
  if (!await agitate.isEnabled()) throw Error('Playback did not enable Agitate');
  if (!(await button('Step').isDisabled())) throw Error('Step enabled during playback');
  await button('Stop').click();
  const stopped = await tick.innerText();
  await page.waitForTimeout(180);
  if (stopped !== (await tick.innerText())) throw Error('Pause did not freeze the clock');
  if (!(await button('Step').isEnabled())) throw Error('Step disabled while stopped');
  await button('Step').click();
  await page.getByText('Tick ' + (Number(stopped.split(' ')[1]) + 1), { exact: true }).waitFor();
  await tab('World').click();
  await button('Reset').click();
  await page.getByText('Tick 0', { exact: true }).waitFor();
  if (!initial.equals(await canvas.screenshot()))
    throw Error('Reset did not restore the tunnel pixels');
  await button('Blank canvas').click();
  async function point(x, y) {
    const rect = await canvas.boundingBox();
    return {
      x: rect.x + (rect.width * (x + 0.5)) / 160,
      y: rect.y + (rect.height * (y + 0.5)) / 240,
    };
  }
  async function sample(x, y) {
    const p = await point(x, y);
    return page.screenshot({
      clip: { x: Math.floor(p.x), y: Math.floor(p.y), width: 2, height: 2 },
    });
  }
  async function tap(x, y) {
    const p = await point(x, y);
    await page.mouse.click(p.x, p.y);
  }
  const blank = await sample(82, 102);
  await tab('Build').click();
  await button('Wall').click();
  const a = await point(30, 100),
    b = await point(125, 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (blank.equals(await sample(82, 102)))
    throw Error('Horizontal stroke failed to paint while held');
  await page.mouse.up();
  const intact = await sample(62, 102);
  await button('Erase').click();
  await tap(82, 102);
  await page.waitForTimeout(100);
  if (!blank.equals(await sample(82, 102)) || !intact.equals(await sample(62, 102)))
    throw Error('Vent did not cut only the selected tile');
  await tab('Air').click();
  await button('Fan').click();
  await tap(40, 120);
  await page.getByText('Fan facing right', { exact: true }).waitFor();
  await tap(40, 120);
  await page.getByText('Fan facing down', { exact: true }).waitFor();
  const knob = page.getByRole('spinbutton', { name: 'Fan strength' });
  const dial = page.locator('[data-kit=knob]').filter({ has: knob }).locator('[data-kit=knob-dial]');
  const rect = await dial.boundingBox();
  const fanScene = await canvas.screenshot();
  const value = () => knob.inputValue();
  if ((await value()) !== '55') throw Error('Initial knob value');
  await page.mouse.move(rect.x + 20, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 20, rect.y + rect.height / 2 - 40);
  await page.mouse.up();
  if ((await value()) !== '75') throw Error('Vertical knob scrub: ' + (await value()));
  await knob.focus();
  for (const [key, expected] of [
    ['End', 100],
    ['ArrowDown', 99],
    ['Home', 0],
    ['ArrowUp', 1],
  ]) {
    await page.keyboard.press(key);
    if ((await value()) !== String(expected)) throw Error('Keyboard knob: ' + key);
  }
  if (!fanScene.equals(await canvas.screenshot())) throw Error('Knob input painted canvas');
  await tab('Air').focus();
  await page.keyboard.press('ArrowRight');
  if ((await tab('Build').getAttribute('aria-selected')) !== 'true') throw Error('Keyboard tabs');
  await tab('World').click();
  await cartridge.getByRole('button', { name: 'Save', exact: true }).waitFor();
  await tab('Air').click();
  await button('Pressure').click();
  await tap(70, 50);
  await button('Step').click();
  await tab('World').click();
  await page.getByRole('checkbox', {name:'Pressure', exact:true}).click();
  await page.getByText(/Blue · low/).waitFor();
  await page.getByRole('checkbox', {name:'Pressure', exact:true}).click();
  await button('Load tunnel').click();
  await page.getByText('Comparison tunnel', { exact: true }).waitFor();
  if (!initial.equals(await canvas.screenshot())) throw Error('Reloaded preset differs');

  // A mouse drag cannot reproduce a mobile browser's default swipe-to-scroll.
  const previousSize = page.viewportSize();
  const session = await page.context().newCDPSession(page);
  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await tab('Air').click();
    const touchKnob = await dial.boundingBox();
    const center = { x: touchKnob.x + 20, y: touchKnob.y + touchKnob.height / 2 };
    const beforeKnob = await canvas.screenshot();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x, y: center.y - 40 }],
    });
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Fan strength"]').value === '75',
    );
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (!beforeKnob.equals(await canvas.screenshot())) throw Error('Touch knob painted canvas');
    const brushSlider = page.getByRole('slider', { name: 'Brush size' });
    const rail = await brushSlider.boundingBox();
    const dragBrush = (type, fraction) => session.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x: rail.x + rail.width / 2, y: rail.y + rail.height * fraction }],
    });
    await dragBrush('touchStart', 0.95);
    await dragBrush('touchMove', 0.65);
    await page.waitForFunction(() => {
      const value = document.querySelector('[aria-label="Brush size"]').valueAsNumber;
      return value > 0 && value < 1;
    });
    await dragBrush('touchEnd');
    await page.waitForFunction(() => document.querySelector('[aria-label="Brush size"]').value === '1');
    await tab('World').click();
    await button('Blank canvas').click();
    await tab('Build').click();
    await button('Wall').click();
    const dock = await tab('Build').boundingBox();
    for (const [x1, y1, x2, y2] of [
      [48, 24, 48, 180],
      [32, 204, 130, 204],
    ]) {
      const midX = (x1 + x2) / 2,
        midY = (y1 + y2) / 2;
      const before = await sample(midX, midY);
      const start = await point(x1, y1),
        finish = await point(x2, y2);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finish] });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      if (before.equals(await sample(midX, midY)))
        throw Error('Touch stroke invisible before lift');
      if ((await tab('Build').boundingBox()).y !== dock.y)
        throw Error('Hotbar moved during drawing');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const layoutFailures = [];
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const [label, left] of [['Agitate', true], ['Play', false], ['Step', false]]) {
        // React Native Web updates the dock inset after a viewport resize.
        // Read the case and its cap in one layout snapshot.
        const bounds = await button(label).evaluate(el => ({
          target: el.getBoundingClientRect().toJSON(),
          panel: el.closest('.sw-face').getBoundingClientRect().toJSON(),
          cap: el.querySelector('[data-kit="code-copy"]').getBoundingClientRect().toJSON(),
        }));
        const { target, panel, cap } = bounds;
        if (target.width < 44 || target.height < 44 ||
            (left ? cap.x > panel.x - 2 : cap.right < panel.right + 2))
          throw Error(label + ' cap geometry at width ' + width + ': ' + JSON.stringify(bounds));
      }
      for (const name of ['Materials', 'Air', 'Build', 'Thermal', 'World']) {
        await tab(name).click();
        await powered(name).waitFor();
        if (name === 'Air' || name === 'Thermal') {
          const { width: dialWidth, height: dialHeight } = await page.locator('[data-kit="knob-dial"]').boundingBox();
          const diameter = width <= 370 ? 56 : 60;
          if (dialWidth !== diameter || dialHeight !== diameter)
            throw Error(name + ' dial at ' + width + ' is ' + dialWidth + ' × ' + dialHeight);
        }
        const lost = await page.evaluate(() => {
          const problems = [];
          const describe = (el) => el.getAttribute('aria-label') || el.dataset.kit ||
            el.className || el.tagName;
          for (const element of document.querySelectorAll(
            'button,input[type="range"],[role="spinbutton"],[role="tab"],[data-testid="world"]',
          )) {
            if (!element.checkVisibility()) continue;
            const r = element.getBoundingClientRect();
            if (!r.width || !r.height || r.left < -1 || r.top < -1 ||
                r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
              problems.push([describe(element), r.toJSON()]);
          }
          for (const el of document.querySelectorAll('*')) {
            if (/auto|scroll/.test(getComputedStyle(el).overflowY) &&
                el.scrollHeight > el.clientHeight + 1)
              problems.push([describe(el), 'scroll', el.clientHeight, el.scrollHeight]);
          }
          if (scrollY || document.documentElement.scrollHeight > innerHeight + 1)
            problems.push(['page', scrollY, document.documentElement.scrollHeight]);
          return problems;
        });
        if (lost.length) layoutFailures.push({ name, width, height, lost });
      }
    }
    if (layoutFailures.length) throw Error('Controls outside the viewport: ' + JSON.stringify(layoutFailures));
  } finally {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await session.detach();
    if (previousSize) await page.setViewportSize(previousSize);
  }
  await tab('World').click();
  await button('Load tunnel').click();
  await tab('Materials').click();
  await button('Wax').click();
  if (errors.length) throw Error(errors.join('\n'));
  return 'Verified cartridge power cycles, side controls, fixed viewport and live touch strokes.';
}
