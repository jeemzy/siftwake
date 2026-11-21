// Run against the exported web game with playwright-cli run-code --filename.
async (page) => {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const button = (name) => page.getByRole('button', { name, exact: true });
  const key = page.locator('.sw-hotbar button');
  const carrier = page.locator('.sw-slot-carrier');
  const toggle = carrier.locator('.sw-inventory-key');
  const panel = page.getByRole('dialog', { name: 'Material inventory' });
  const group = page.getByLabel('Material group');
  const query = page.getByLabel('Search materials');
  const catalog = page.getByRole('region', { name: 'Material catalog' });
  const card = (name) => catalog.getByRole('button', { name, exact: true });
  const focused = (locator) => locator.evaluate(el => el === document.activeElement);
  async function checkTargets() {
    const missed = await carrier.getByRole('button').evaluateAll(keys => keys.flatMap((el, i) => {
      const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
      const x = (left + right) / 2, y = (top + bottom) / 2;
      const face = el.querySelector('.sw-lcd-key-face')?.getBoundingClientRect();
      const points = [[x, y], [left + 1, y], [right - 1, y], [x, top + 1], [x, bottom - 1]];
      return width >= 44 && height >= 44 && face && face.height < height &&
        points.every(([px, py]) => document.elementFromPoint(px, py)?.closest('button') === el)
        ? [] : [{ slot: i + 1, left, right, width, height }];
    }));
    check(!missed.length, 'Cartridge hit area or visible face: ' + JSON.stringify(missed));
  }
  const sameKeys = () => key.evaluateAll(nodes => nodes.length === 6 &&
    nodes[0].parentElement === window.initialRow && nodes.every((el, i) => el === window.initialKeys[i]));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button('Inventory').waitFor();
  await key.evaluateAll(nodes => {
    window.initialKeys = nodes;
    window.initialRow = nodes[0].parentElement;
    window.initialToggle = document.querySelector('.sw-inventory-key');
    window.initialShell = document.querySelector('.sw-lcd-shell');
    window.initialPane = nodes[0].closest('.sw-lcd-pane');
    window.hotbarSamples = [];
    function sample() {
      const current = document.querySelector('.sw-hotbar');
      const sheet = document.querySelector('.sw-inventory-sheet');
      window.hotbarSamples.push({
        phase: sheet?.closest('dialog')?.dataset.phase,
        sheetY: sheet?.getBoundingClientRect().y,
        carrierY: document.querySelector('.sw-slot-carrier')?.getBoundingClientRect().y,
        same: current.closest('.sw-lcd-shell') === window.initialShell &&
          current.closest('.sw-lcd-pane') === window.initialPane && window.initialShell.contains(window.initialToggle) &&
          document.querySelector('.sw-inventory-key') === window.initialToggle && current === window.initialRow && current.children.length === 6 &&
          nodes.every((node, i) => node === current.children[i]),
        y: current?.getBoundingClientRect().y,
      });
      window.hotbarFrame = requestAnimationFrame(sample);
    }
    sample();
  });
  const before = await key.first().boundingBox();
  const originalSocket = await page.locator('.sw-inventory-socket').boundingBox();
  check(await carrier.getByRole('button').count() === 7 && await key.count() === 6, 'Six bindings plus one fixed key');
  await checkTargets();
  await button('Play').click();
  await button('Inventory').click();
  await panel.waitFor();
  check(await sameKeys(), 'Opening remounted the hotbar');
  check(await catalog.getByRole('button').count() === 56, 'The expanded catalog is incomplete');
  await page.waitForFunction(() => document.querySelector('.sw-inventory').dataset.phase === 'open');
  check(await panel.getByRole('heading', { name: 'Inventory', exact: true }).count() === 0, 'Extra inventory header');
  check(await toggle.getAttribute('aria-label') === 'Close inventory', 'Fixed key did not switch to Close');
  const header = await key.first().boundingBox();
  const expandedSocket = await page.locator('.sw-inventory-socket').boundingBox();
  check(Math.abs(originalSocket.y - expandedSocket.y) < 1, 'Host expansion moved the bottom socket');
  const pickup = await page.evaluate((dockY) => {
    const opening = window.hotbarSamples.filter(s => s.phase === 'opening');
    return opening.some(s => s.sheetY > dockY + 10 && Math.abs(s.carrierY - dockY) < 1.5) &&
      opening.some(s => s.sheetY > 20 && s.sheetY < dockY - 15 && Math.abs(s.carrierY - s.sheetY) < 12);
  }, originalSocket.y);
  check(pickup, 'Sliding sheet did not collect the waiting cartridge');
  const inTransit = await page.evaluate(([start, end]) =>
    window.hotbarSamples.some(s => s.y > end + 3 && s.y < start - 3), [before.y, header.y]);
  check(inTransit, 'No frame showed travel between the two sockets');
  check(header.y < before.y && header.height >= 44, 'Header target geometry');
  await checkTargets();
  const top = await key.first().boundingBox();
  await catalog.evaluate(el => { el.scrollTop = el.scrollHeight; });
  check((await key.first().boundingBox()).y === top.y, 'Header scrolled away');
  await query.fill('unknown mixture');
  await panel.getByText('No matching materials.').waitFor();
  await query.fill('');
  for (const [category, name] of [['Weather', 'Slush'], ['Chemistry', 'Gypsum'], ['Engineering', 'Tin'], ['Garden', 'Reed']]) {
    await group.selectOption({ label: category });
    await card(name).click();
    await panel.getByRole('heading', { name: new RegExp(name) }).waitFor();
  }
  await group.selectOption({ label: 'All groups' });
  await card('Steam').click();
  await button('Assign').click();
  await button('Cancel').waitFor();
  check(await focused(key.first()), 'Full assignment focus');
  await page.keyboard.press('Escape');
  check(await focused(button('Assign')), 'Cancel did not restore focus');
  await button('Assign').click();
  await catalog.evaluate(el => { el.scrollTop = el.scrollTop > 0 ? 0 : 35; });
  await button('Cancel').waitFor({ state: 'hidden' });
  check(await focused(button('Assign')), 'Scroll did not cancel and restore focus');
  await button('Assign').click();
  await key.nth(2).click();
  await button('Slot 3, Steam').waitFor();
  check(await focused(button('Assign')), 'Replacement did not restore focus');
  await button('Clear slot').click();
  await button('Slot 3, empty').waitFor();
  await card('Ice').scrollIntoViewIfNeeded();
  const box = await card('Ice').boundingBox();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await button('Slot 3, Ice').waitFor();
  await page.mouse.up();
  await card('Steam').click();
  await button('Use').click();
  await panel.waitFor({ state: 'hidden' });
  const allSame = await page.evaluate(() => {
    cancelAnimationFrame(window.hotbarFrame);
    return window.hotbarSamples.every(s => s.same);
  });
  check(allSame, 'Cartridge shell, glass or keys changed during travel or slot assignment');
  check(await page.evaluate(y => window.hotbarSamples.some(s => s.phase === 'closing' &&
    s.sheetY > y + 12 && Math.abs(s.carrierY - y) < 1.5), originalSocket.y), 'Returning sheet did not leave the cartridge in its socket');
  check(await sameKeys() && await focused(button('Inventory')), 'Close remounted keys or lost focus');
  await checkTargets();
  await button('Stop').waitFor();
  await button('Stop').click();
  check(!(await key.allTextContents()).includes('Steam'), 'Use changed bindings');
  await button('Inventory').click();
  await button('Use').click();
  await panel.waitFor({ state: 'hidden' });
  await page.getByText(/Source · Steam · Unbound/).waitFor();
  await button('Baking soda').click();
  check(await button('Baking soda').getAttribute('data-source') === null, 'Equipping a brush lit the source');
  await button('Baking soda').click();
  await page.waitForFunction(() => document.querySelector('.sw-hotbar [data-source]')?.getAttribute('aria-label') === 'Baking soda');
  const glow = el => getComputedStyle(el, '::after').backgroundColor;
  const sodaGlow = await button('Baking soda').evaluate(glow);
  check(await button('Baking soda').evaluate(el => el.hasAttribute('data-selected') &&
    getComputedStyle(el, '::after').boxShadow !== 'none'), 'Missing selected face or source underglow');
  await button('Clay dust').evaluate(el => { el.click(); el.click(); });
  await page.waitForFunction(() => document.querySelector('.sw-hotbar [data-source]')?.getAttribute('aria-label') === 'Clay dust');
  check(await button('Clay dust').evaluate(glow) !== sodaGlow, 'Different source materials share a fixed-color glow');

  // Reverse both directions before the sheet reaches either end.
  await toggle.evaluate(el => el.click());
  await page.waitForFunction(() => {
    const a = document.querySelector('.sw-inventory-sheet').getAnimations()[0];
    return a && a.currentTime > 160 && a.currentTime < 290;
  });
  const reversal = await toggle.evaluate(async el => {
    const sheet = document.querySelector('.sw-inventory-sheet');
    const y = () => sheet.getBoundingClientRect().y;
    const frame = () => new Promise(done => requestAnimationFrame(done));
    const before = y();
    el.click();
    await Promise.resolve();
    const firstFlip = y();
    await frame(); await frame(); await frame();
    const returning = y();
    el.click();
    await Promise.resolve();
    const secondFlip = y();
    await frame(); await frame();
    return { before, firstFlip, returning, secondFlip, next: y(), phase: el.closest('dialog').dataset.phase };
  });
  check(reversal.phase === 'opening' && Math.abs(reversal.firstFlip - reversal.before) < 1.5 &&
    Math.abs(reversal.secondFlip - reversal.returning) < 1.5 &&
    reversal.returning > reversal.before && reversal.next < reversal.returning,
    'Inventory reversal lost continuity or direction: ' + JSON.stringify(reversal));
  await page.waitForFunction(() => document.querySelector('.sw-inventory').dataset.phase === 'open');
  await button('Close inventory').click();
  await panel.waitFor({ state: 'hidden' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button('Inventory').click();
  await panel.waitFor();
  check(await panel.evaluate(el => el.dataset.phase === 'open' && !el.getAnimations({ subtree: true }).length), 'Reduced motion traveled');
  await card('Steam').click();
  await button('Assign').click();
  check(await key.first().evaluate(el => !el.getAnimations().length && getComputedStyle(el).outlineStyle === 'solid'), 'Reduced motion replacement');
  await button('Close inventory').click();
  await panel.waitFor({ state: 'hidden' });
  await button('Inventory').click();
  await panel.waitFor();
  check(await sameKeys() && await button('Cancel').count() === 0, 'Reopening carried replacement');
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await card('Ice').tap();
    await panel.getByRole('heading', { name: /Ice/ }).waitFor();
    await button('Assign').tap();
    await panel.getByRole('status').filter({ hasText: 'Ice is in slot 3.' }).waitFor();
  }
  const newMaterial = panel.getByRole('button', { name: 'New material', exact: true });
  const fab = await newMaterial.boundingBox();
  const sheetBox = await page.locator('.sw-inventory-sheet').boundingBox();
  check(sheetBox.x + sheetBox.width - fab.x - fab.width < 30 &&
    sheetBox.y + sheetBox.height - fab.y - fab.height < 30, 'Compose key is outside its bottom-right socket');
  await newMaterial.click();
  const editor = page.getByRole('dialog', { name: 'New material', exact: true });
  await editor.waitFor();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  if (await panel.isVisible()) await button('Close inventory').click();
  await page.getByRole('tab', { name: 'Thermal', exact: true }).click();
  await button('Heat').waitFor();
  check(await button('Heat').evaluate(el => el.closest('.sw-lcd-shell') === window.initialShell),
    'Thermal replaced the cartridge shell');
  await page.getByRole('tab', { name: 'Materials', exact: true }).click();
  await button('Inventory').waitFor();
  check(await sameKeys(), 'Switching tabs remounted the Materials keys');
  return 'Seven stable keys, sheet pickup and release, interruptible and reduced motion, narrow geometry, source underglow, focus, binding, touch and floating editor action passed.';
};
