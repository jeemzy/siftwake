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
  await button('Wall').click();
  const a = await point(30, 100),
    b = await point(125, 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  if (blank.equals(await sample(80, 100))) throw Error('Wall stroke did not cross midpoint');
  const intact = await sample(60, 100);
  await button('Erase').click();
  await tap(80, 100);
  await page.waitForTimeout(100);
  if (!blank.equals(await sample(80, 100)) || !intact.equals(await sample(60, 100)))
    throw Error('Vent did not cut only the selected tile');
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
  await button('Pressure overlay').click();
  await page.getByText(/Blue · low/).waitFor();
  await button('Pressure overlay').click();
  await button('Load tunnel').click();
  await page.getByText('Comparison tunnel', { exact: true }).waitFor();
  if (!initial.equals(await canvas.screenshot())) throw Error('Reloaded preset differs');
  if (errors.length) throw Error(errors.join('\n'));
  return 'Passed play, pause, step, reset, wall drawing, vent cutting, fan rotation and strength, pressure overlay, and scene switching. No browser errors.';
}
