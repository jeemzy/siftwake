// Exercise the shared game through touch and the browser's local save slot.
async (page, legacy) => {
  const exact = (name) => ({ name, exact: true });
  const button = (name) => page.getByRole('button', exact(name));
  const tab = (name) => page.getByRole('tab', exact(name));
  const board = page.getByTestId('world');
  const palette = page.getByLabel('Custom material', exact('Custom material'));
  const initial = await board.boundingBox();
  const check = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const bounds = () => board.boundingBox();
  async function paint(x, y) {
    const box = await bounds();
    await page.touchscreen.tap(
      box.x + ((x + 0.5) * box.width) / 160,
      box.y + ((y + 0.5) * box.height) / 240,
    );
  }
  const colors = {
    lacquer: (r, g, b) => r > 175 && g < 45 && b > 130 && r > b + 20,
    green: (r, g, b) => g > 185 && r < 115 && b < 145 && g > b + 70,
    water: (r, g, b) => b > g + 20 && g > r + 45,
    glass: (r, g, b) => g > 170 && b > 165 && Math.abs(g - b) < 23 && g > r + 35,
    wood: (r, g, b) => r > 130 && r > g + 30 && g > b + 15,
  };
  async function verifyPixel(x, y, expected) {
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const png = (await board.screenshot({ scale: 'css' })).toString('base64');
    const actual = await page.evaluate(
      async ({ png, x, y }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + png;
        await img.decode();
        const canvas = Object.assign(document.createElement('canvas'), {
          width: img.width,
          height: img.height,
        });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return [
          ...ctx.getImageData(
            Math.floor(((x + 0.5) * img.width) / 160),
            Math.floor(((y + 0.5) * img.height) / 240),
            1,
            1,
          ).data,
        ].slice(0, 3);
      },
      { png, x, y },
    );
    // Grain shading and CanvasKit's display color conversion vary across hosts.
    check(
      colors[expected](...actual),
      'Unexpected cell at ' + x + ',' + y + ' = ' + actual + ', expected ' + expected,
    );
  }

  await tab('World').click();
  await button('Blank canvas').click();
  await tab('Materials').click();
  await button('Fine').click();
  await button('New material').click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  check(JSON.stringify(await bounds()) === JSON.stringify(initial), 'Editor moved the canvas');
  check(
    await page.evaluate(
      () => document.documentElement.scrollHeight === innerHeight && scrollY === 0,
    ),
    'Editor made the drawing page scroll',
  );
  const field = (name) => dialog.getByLabel(name, exact(name));
  await field('Name').fill('Lacquer');
  await field('Color').fill('pink');
  await field('Movement').selectOption({ label: 'Fixed solid' });
  await field('Density (1–100)').fill('101');
  await button('Add reaction').click();
  await button('Create material').click();
  await dialog.getByText('Enter a density from 1 to 100.').waitFor();
  await dialog.getByText('Choose a material for this contact.').waitFor();
  check((await field('Name').inputValue()) === 'Lacquer', 'Validation lost name');
  check(
    (await field('Color').getAttribute('aria-invalid')) === 'true',
    'Validation did not flag color',
  );
  await page.waitForFunction(() => document.activeElement?.id === 'sw-color');
  await field('Color').fill('#D600AA');
  await field('Density (1–100)').fill('65');
  await field('Touches').selectOption({ label: 'Water' });
  await field('Contact material becomes').selectOption({ label: 'Glass' });
  await button('Create material').click();
  await dialog.waitFor({ state: 'hidden' });
  check(
    (await palette.locator(':checked').textContent()) === 'Lacquer',
    'New material not selected',
  );
  await paint(80, 90);
  await verifyPixel(80, 90, 'lacquer');
  await button('Edit material').click();
  await dialog.waitFor();
  await field('Name').fill('Green lacquer');
  await field('Color').fill('#45DD64');
  await button('Add reaction').click();
  const added = dialog.getByRole('group', exact('Reaction 2'));
  await added.getByLabel('Touches').selectOption({ label: 'Water' });
  await button('Apply changes').click();
  await added.getByText('A reaction already exists for this pair.').waitFor();
  check(
    (await field('Name').inputValue()) === 'Green lacquer',
    'Duplicate reaction lost the draft',
  );
  await button('Remove reaction 2').click();
  await button('Apply changes').click();
  await dialog.waitFor({ state: 'hidden' });
  check(
    (await palette.locator(':checked').textContent()) === 'Green lacquer',
    'Rename did not update palette',
  );
  await verifyPixel(80, 90, 'green');
  await button('Water').click();
  await paint(83, 90);
  await verifyPixel(82, 90, 'water');
  await button('Step').click();
  await verifyPixel(82, 90, 'glass');

  await palette.selectOption({ label: 'Green lacquer' });
  await tab('World').click();
  await button('Save').click();
  await page.getByText('World saved.', exact('World saved.')).waitFor();
  await page.reload();
  await page.getByText('Tick 1', exact('Tick 1')).waitFor();
  await button('Play').waitFor();
  await verifyPixel(80, 90, 'green');
  await verifyPixel(82, 90, 'glass');
  await tab('Materials').click();
  check(
    (await palette.locator(':checked').textContent()) === 'Green lacquer',
    'Selected material was not restored',
  );
  await button('Water').click();
  await paint(77, 90);
  await button('Step').click();
  await verifyPixel(78, 90, 'glass');

  // The fixture was written by the 0.3.0 World.snapshot implementation.
  await page.addInitScript((world) => {
    localStorage.setItem(
      'siftwake.world',
      JSON.stringify([
        {
          world,
          editor: JSON.stringify({
            version: 1,
            editor: {
              scene: 'Blank',
              tool: 'Wood',
              brush: 1,
              category: 'Materials',
              camera: { Pressure: false, Air: false, Heat: false },
            },
          }),
        },
      ]),
    );
  }, legacy);
  await page.reload();
  await page.getByText('Tick 2', exact('Tick 2')).waitFor();
  check(
    (await button('Wood').getAttribute('aria-pressed')) === 'true',
    'Legacy selected tool did not restore',
  );
  await verifyPixel(30, 40, 'wood');
  return 'Touch painting, validation, ID-preserving edit, reaction, paused reopen and 0.3.0 restore passed.';
};
