// Run against the water worktree with playwright-cli run-code --filename tests/water.playwright.js.
async (page) => {
  await page.reload();
  const control = (label) => page.getByLabel(label, { exact: true });
  await control('World').click();
  await control('Blank canvas').click();
  await control('Materials').click();
  await control('Fine').click();
  const board = page.getByTestId('world');
  const bounds = await board.boundingBox();
  const point = (x, y) => ({
    x: bounds.x + (bounds.width * (x + 0.5)) / 160,
    y: bounds.y + (bounds.height * (y + 0.5)) / 240,
  });
  async function paint(tool, x, y) {
    await control(tool).click();
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
