// Run against the water worktree with playwright-cli run-code --filename tests/water.playwright.js.
async (page) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  const control = (name) => {
    const options = { name, exact: true };
    return page.getByRole('button', options).or(page.getByRole('tab', options));
  };
  await control('World').click();
  await control('Blank canvas').click();
  await control('Materials').click();
  await page.getByRole('slider', { name: 'Brush size' }).press('Home');
  const board = page.getByTestId('world');
  // A fractional canvas origin blends adjacent cell colors when Chrome composites the image.
  // Give each cell two whole screen pixels before checking the one-cell reaction boundary.
  const initial = await board.boundingBox();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: viewport.width, height: viewport.height + 480 - Math.round(initial.height) });
  await page.waitForFunction(() => {
    const r = document.querySelector('[data-testid="world"]').getBoundingClientRect();
    return r.width === 320 && r.height === 480 && Number.isInteger(r.left) && Number.isInteger(r.top);
  });
  const bounds = await board.boundingBox();
  const point = (x, y) => ({
    x: bounds.x + (bounds.width * (x + 0.5)) / 160,
    y: bounds.y + (bounds.height * (y + 0.5)) / 240,
  });
  async function paint(tool, x, y) {
    await control('Inventory').click();
    const inventory = page.getByRole('dialog', { name: 'Material inventory' });
    await inventory.getByLabel('Search materials').fill(tool);
    await inventory.getByRole('region', { name: 'Material catalog' })
      .getByRole('button', { name: tool, exact: true }).click();
    await control('Use').click();
    await inventory.waitFor({ state: 'hidden' });
    const p = point(x, y);
    await page.mouse.click(p.x, p.y);
  }
  async function checkMaterial(x, y, material) {
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const png = (await board.screenshot({ scale: 'css' })).toString('base64');
    const actual = await page.evaluate(
      async ({ png, x, y }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const px = Math.floor(((x + 0.5) * image.width) / 160);
        const py = Math.floor(((y + 0.5) * image.height) / 240);
        return Array.from(context.getImageData(px, py, 1, 1).data).slice(0, 3);
      },
      { png, x, y },
    );
    // Distinguish blue, gold and damp brown across per-cell shading and P3/sRGB conversion.
    const [r, g, b] = actual;
    const matches = {
      water: b > g && g > r + 45,
      sand: r > 200 && g > b + 45,
      wetSand: r > 130 && r < 200 && g > b + 25,
    };
    if (!matches[material]) {
      throw Error('Unexpected material at ' + x + ',' + y + ': ' + actual);
    }
  }
  await paint('Sand', 80, 80);
  await paint('Water', 83, 80);
  await checkMaterial(81, 80, 'sand');
  await checkMaterial(82, 80, 'water');
  await control('Step').click();
  await checkMaterial(81, 80, 'wetSand');
  await control('World').click();
  await control('Load tunnel').click();
  return 'Verified painted sand and water, then wet sand at their contact after one step.';
}
