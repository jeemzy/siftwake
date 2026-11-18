// Run with playwright-cli run-code --filename tests/tunnel.playwright.js.
async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.reload();
  const button = (name) => page.getByRole('button', { name, exact: true });
  const canvas = page.getByTestId('world');
  const tick = page.getByTestId('tick');
  await button('Step').waitFor();
  const initial = await canvas.screenshot();
  await button('Step').click();
  await page.getByText('Tick 1', { exact: true }).waitFor();
  await button('Play').click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid=tick]').textContent.split(' ')[1]) >= 12,
  );
  await button('Pause').click();
  const stopped = await tick.innerText();
  await page.waitForTimeout(180);
  if (stopped !== (await tick.innerText())) throw Error('Pause did not freeze the clock');
  await button('World').click();
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
  const blank = await sample(80, 100);
  await button('Build').click();
  await button('Wall').click();
  const a = await point(30, 100),
    b = await point(125, 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (blank.equals(await sample(80, 100))) throw Error('Horizontal stroke failed to paint while held');
  await page.mouse.up();
  const intact = await sample(60, 100);
  await button('Erase').click();
  await tap(80, 100);
  await page.waitForTimeout(100);
  if (!blank.equals(await sample(80, 100)) || !intact.equals(await sample(60, 100)))
    throw Error('Vent did not cut only the selected tile');
  await button('Air').click();
  await button('Fan').click();
  await tap(40, 120);
  await page.getByText('Fan facing right', { exact: true }).waitFor();
  await tap(40, 120);
  await page.getByText('Fan facing down', { exact: true }).waitFor();
  const slider = page.getByRole('slider', { name: 'Fan strength' });
  const rect = await slider.boundingBox();
  await page.mouse.click(rect.x + 0.8 * rect.width, rect.y + rect.height / 2);
  const percent = page.getByText(/^\d+%$/);
  if (parseInt(await percent.innerText()) <= 55) throw Error('Fan strength did not increase');
  await button('Pressure').click();
  await tap(70, 50);
  await button('Step').click();
  await button('World').click();
  await button('Pressure overlay').click();
  await page.getByText(/Blue · low/).waitFor();
  await button('Pressure overlay').click();
  await button('Load tunnel').click();
  await page.getByText('Comparison tunnel', { exact: true }).waitFor();
  if (!initial.equals(await canvas.screenshot())) throw Error('Reloaded preset differs');

  // A mouse drag cannot reproduce a mobile browser's default swipe-to-scroll.
  const previousSize = page.viewportSize();
  const session = await page.context().newCDPSession(page);
  try {
    await page.setViewportSize({ width: 375, height: 667 });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await button('Blank canvas').click();
    await button('Build').click();
    await button('Wall').click();
    const dock = await button('Build').boundingBox();
    for (const [x1,y1,x2,y2] of [[48,24,48,180],[32,204,130,204]]) {
      const midX=(x1+x2)/2, midY=(y1+y2)/2;
      const before=await sample(midX,midY);
      const start=await point(x1,y1), finish=await point(x2,y2);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finish]});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (before.equals(await sample(midX,midY))) throw Error('Touch stroke invisible before lift');
      if ((await button('Build').boundingBox()).y!==dock.y) throw Error('Hotbar moved during drawing');
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await page.setViewportSize({width,height});
      for (const name of ['Materials','Air','Build','World']) {
        await button(name).click();
        const lost = await page.evaluate(() => [...document.querySelectorAll('[role="button"],[role="slider"],[data-testid="world"]')].some(element => {
          const r=element.getBoundingClientRect();
          return !r.width || !r.height || r.left < -1 || r.top < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1;
        }) || [...document.querySelectorAll('*')].some(element =>
          /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1
        ) || window.scrollY !== 0 || document.documentElement.scrollHeight>innerHeight+1);
        if(lost) throw Error(name+' controls overflow at '+width+' by '+height);
      }
    }
  } finally {
    await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await session.detach();
    if (previousSize) await page.setViewportSize(previousSize);
  }
  await button('World').click(); await button('Load tunnel').click();
  await button('Materials').click(); await button('Sand').click();
  if (errors.length) throw Error(errors.join('\n'));
  return 'Passed tunnel controls, category switching, fixed viewport, and horizontal and vertical touch strokes before lift. No browser errors.';
}
