// Open a local directory listing of www.bundle extracted from the IPA, then run with playwright-cli.
async (page) => {
  const entries = await page
    .locator('a[href$=".html"]')
    .evaluateAll((links) => links.map((a) => a.href));
  if (!entries.length) throw Error('No packaged DOM panels');
  await page.addInitScript(() => {
    const names = [
      'onCategory',
      'onViewChange',
      'onScene',
      'onTool',
      'onBrush',
      'onPower',
      'onPlayback',
      'onStep',
      'onEditorVisibility',
      'onMaterial',
      'onSave',
      'onMotionChange',
      'onAgitate',
      'onInventoryVisibility',
      'onHotbarChange',
      'onThermalPower',
      'onSourceMode',
      'onProbeMode',
    ];
    const props = {
      groups: {
        Materials: ['Sand', 'Water', 'Gravel', 'Smoke', 'Wood', 'Flame'],
        Air: ['Wind', 'Fan', 'Pressure', 'Suction'],
        Build: ['Wall', 'Erase'],
        Thermal: ['Heat', 'Cool', 'Probe'],
        World: [],
      },
      tool: 274,
      camera: { Pressure: false, Air: false, Heat: false },
      reading: null,
      probe: null,
      probeMode: false,
      materials: [],
      expanded: false,
      brush: 1,
      category: 'Materials',
      power: 55,
      sceneGeneration: 0,
      updateReady: false,
      scene: 'Blank',
      feedback: '',
      paused: true,
      motionSupported: true,
      motionEnabled: false,
      motionPending: false,
      motionStatus: '',
      hotbar: [274, 269, 268, 278, 284, 5],
      inventoryOpen: false,
      thermalPower: 100,
      sourceMode: false,
    };
    const host = window.frameElement;
    if (host?.id === 'inventory-webview') props.inventoryViewportHeight = Number(host.dataset.expandedHeight);
    const emit = (type, data) =>
      window.dispatchEvent(new CustomEvent('$$dom_event', { detail: { type, data } }));
    window.observedActions = [];
    window.transportActions = [];
    window.agitations = 0;
    window.editorActions = [];
    window.motionActions = [];
    window.ReactNativeWebView = {
      injectedObjectJson: () =>
        JSON.stringify({ EXPO_DOM_HOST_OS: 'ios', initialProps: { names, props } }),
      postMessage(raw) {
        const message = JSON.parse(raw);
        if (message.type !== '$$native_action') return;
        const { actionId, uid, args } = message.data;
        let result = null;
        if (actionId === 'onPlayback') {
          props.paused = !props.paused;
          window.transportActions.push(actionId);
          if (window.deferPlaybackEcho) {
            window.deferPlaybackEcho = false;
            window.finishPlayback = () => {
              emit('$$native_action_result', { actionId, uid, result: null });
              emit('$$props', { names, props });
            };
            return;
          }
        }
        if (actionId === 'onStep') window.transportActions.push(actionId);
        if (actionId === 'onAgitate') window.agitations++;
        if (actionId === 'onBrush') props.brush = args[0];
        if (actionId === 'onPower') props.power = args[0];
        if (actionId === 'onProbeMode') {
          props.probeMode = args[0];
          if (props.probeMode) props.tool = 'Probe';
          else if (props.tool === 'Probe') props.tool = 'Heat';
        }
        if (actionId === 'onTool') {
          if (args[0] === 'Probe') props.probeMode = true;
          props.tool = args[0];
          props.sourceMode = false;
          props.probe = { temperature: 155, pressure: 0.01, speed: 1.54, direction: 'E' };
        }
        if (actionId === 'onInventoryVisibility') {
          if (host?.id === 'inventory-webview') {
            const open = args[0];
            const fixedViewport = host.dataset.layout === 'clipped';
            setTimeout(() => {
              props.inventoryOpen = open;
              if (!fixedViewport) props.expanded = open;
              emit('$$native_action_result', { actionId, uid, result });
              emit('$$props', { names, props });
              setTimeout(() => {
                host.parentElement.style.height = (open ? props.inventoryViewportHeight : 241) + 'px';
                // The native clip changes before its onLayout acknowledgement reaches the WebView.
                if (fixedViewport) setTimeout(() => {
                  props.expanded = open;
                  emit('$$props', { names, props });
                }, 60);
              }, 140);
            }, 90);
            return;
          }
          props.inventoryOpen = args[0];
          props.expanded = args[0];
        }
        if (actionId === 'onHotbarChange') props.hotbar = args[0];
        if (actionId === 'onThermalPower') props.thermalPower = args[0];
        if (actionId === 'onSourceMode') props.sourceMode = args[0];
        if (actionId === 'onCategory') {
          props.category = args[0];
          if (props.category !== 'Thermal') props.probeMode = false;
        }
        if (actionId === 'onEditorVisibility') {
          props.expanded = args[0] || props.inventoryOpen;
          window.editorActions.push([actionId, args]);
        }
        if (actionId === 'onSave') {
          window.editorActions.push([actionId, args]);
          result = 'World saved.';
        }
        if (actionId === 'onMotionChange') {
          const [requested] = args;
          window.motionActions.push(requested);
          props.motionPending = true;
          props.motionStatus = '';
          emit('$$props', { names, props });
          window.finishMotion = (granted) => {
            props.motionEnabled = requested && granted;
            props.motionStatus = requested && !granted ? 'Motion access denied.' : '';
            props.motionPending = false;
            emit('$$native_action_result', { actionId, uid, result: null });
            emit('$$props', { names, props });
          };
          return;
        }
        if (actionId === 'onMaterial') {
          window.editorActions.push([actionId, args]);
          const [editing, draft] = args;
          if (!draft.name) result = { errors: { name: 'Enter a material name.' } };
          else {
            const id = editing ?? 17;
            props.materials = [{ ...draft, id, density: Number(draft.density) }];
            props.tool = id;
            result = { id };
          }
        }
        if (actionId === 'onViewChange') {
          window.observedActions.push(args);
          const [key, enabled] = args;
          if (key === 'Normal') props.camera = { Pressure: false, Air: false, Heat: false };
          else props.camera = { ...props.camera, [key]: enabled };
        }
        queueMicrotask(() => {
          emit('$$native_action_result', { actionId, uid, result });
          emit('$$props', { names, props });
        });
      },
    };
  });
  async function checkInventoryTravel(url, layout) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1">');
    const boardPoint = await page.evaluate(({ src, layout }) => {
      const board = document.createElement('div');
      board.id = 'board';
      board.style.cssText = 'position:fixed;inset:0';
      board.dataset.presses = '0';
      board.onpointerdown = () => { board.dataset.presses = String(Number(board.dataset.presses) + 1); };
      const clip = document.createElement('div');
      clip.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:25px;height:241px;overflow:hidden';
      clip.style.width = (Math.min(innerWidth, 660) - (innerWidth <= 350 ? 0 : 16)) + 'px';
      const frame = document.createElement('iframe');
      frame.id = frame.name = 'inventory-webview';
      frame.dataset.expandedHeight = String(innerHeight - 30);
      frame.dataset.layout = layout;
      frame.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;border:0';
      frame.style.height = layout === 'clipped' ? frame.dataset.expandedHeight + 'px' : '100%';
      frame.src = src;
      clip.append(frame);
      document.body.append(board, clip);
      return { x: innerWidth / 2, y: Math.max(10, clip.getBoundingClientRect().top / 2) };
    }, { src: url, layout });
    const panel = page.frameLocator('#inventory-webview');
    const key = panel.getByRole('button', { name: 'Inventory', exact: true });
    await key.waitFor();
    async function checkBoardInput(expectedPresses) {
      await page.touchscreen.tap(boardPoint.x, boardPoint.y);
      const presses = await page.locator('#board').getAttribute('data-presses');
      if (Number(presses) !== expectedPresses)
        throw Error(layout + ' inventory clip routed a board touch incorrectly: ' + presses);
    }
    await checkBoardInput(1);
    const frame = page.frame({ name: 'inventory-webview' });
    await frame.evaluate(() => {
      const shell = document.querySelector('.sw-lcd-shell');
      const pane = shell.querySelector('.sw-slot-glass');
      const keys = [...pane.querySelectorAll('button')];
      const sheet = document.querySelector('.sw-inventory-sheet');
      const dialog = sheet.closest('dialog');
      window.travelFrames = [];
      function sample() {
        const hostRect = frameElement.getBoundingClientRect();
        const clip = frameElement.parentElement.getBoundingClientRect();
        const rect = shell.getBoundingClientRect();
        window.travelFrames.push({
          time: performance.now(), phase: dialog.dataset.phase, height: innerHeight, clipHeight: clip.height,
          layoutAcknowledged: !!document.querySelector('.sw-dock[data-expanded]'), hostTop: hostRect.top,
          modal: dialog.matches(':modal'), y: hostRect.top + rect.top, clipTop: clip.top,
          sheetY: hostRect.top + sheet.getBoundingClientRect().top, hostBottom: hostRect.bottom,
          visible: shell.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
            hostRect.top + rect.top >= clip.top - 1 && hostRect.top + rect.bottom <= clip.bottom + 1,
          same: document.querySelector('.sw-lcd-shell') === shell && pane.parentElement === shell &&
            keys.every((el, i) => pane.querySelectorAll('button')[i] === el),
        });
        window.travelFrame = requestAnimationFrame(sample);
      }
      sample();
    });
    await key.tap();
    await frame.waitForFunction(() => document.querySelector('.sw-inventory').dataset.phase === 'open');
    const openEnd = await frame.evaluate(() => window.travelFrames.length);
    await checkBoardInput(1);
    const toggle = panel.locator('.sw-inventory-key');
    // Reverse while both the sheet and cartridge are moving, in both directions.
    await toggle.tap();
    await frame.waitForFunction(() => {
      const first = window.travelFrames[0], last = window.travelFrames.at(-1);
      return last.phase === 'closing' && last.y > 75 && last.y < first.y - 30;
    });
    const reverseInFlight = () => toggle.evaluate(el => {
      const start = window.travelFrames.length;
      el.click();
      return start;
    });
    const reopened = await reverseInFlight();
    await frame.waitForFunction(i => {
      const last = window.travelFrames.at(-1);
      return last.phase === 'opening' && last.y < window.travelFrames[i - 1].y - 8;
    }, reopened);
    const reclosed = await reverseInFlight();
    await frame.waitForFunction(() => frameElement.parentElement.clientHeight === 241 &&
      !document.querySelector('.sw-dock[data-expanded]') && document.querySelector('.sw-inventory').dataset.phase === 'docked');
    await checkBoardInput(2);
    const samples = await frame.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      cancelAnimationFrame(window.travelFrame);
      return window.travelFrames;
    });
    await page.locator('#inventory-webview').evaluate(el => el.remove());
    const dockY = samples[0].y;
    if (dockY - samples[0].clipTop < 3)
      throw Error('The docked LCD bezel touches the native clipping edge');
    const opened = samples.find(s => s.phase === 'open' && s.clipHeight > 241);
    if (!opened) throw Error('Inventory never arrived in its expanded WebView');
    const headerInset = opened.y - opened.sheetY;
    for (const [i, s] of samples.entries()) {
      if (layout === 'clipped') {
        if (s.height !== opened.clipHeight || s.hostTop !== samples[0].hostTop)
          throw Error('Opening or closing resized the embedded WebView backing surface');
        if (s.modal && (!s.layoutAcknowledged || s.clipHeight === 241))
          throw Error('Inventory began travelling before its native clip expanded and acknowledged layout');
      }
      const expected = s.clipHeight === 241 || !s.modal ? dockY : Math.min(dockY, s.sheetY + headerInset);
      if (!s.same || !s.visible || Math.abs(s.y - expected) > 1.5)
        throw Error('Inventory jumped or lost its shell on frame ' + i + ': ' +
          JSON.stringify({ expected, ...s }));
    }
    const opening = samples.slice(0, openEnd);
    const firstExpanded = opening.find(s => s.modal && s.clipHeight > 241);
    if (!firstExpanded || firstExpanded.sheetY < firstExpanded.hostBottom - 32)
      throw Error('The first expanded inventory frame skipped the entrance from below the dock: ' +
        JSON.stringify(firstExpanded));
    const closing = samples.slice(reclosed).filter(s => s.phase === 'closing');
    for (const [stage, frames] of [['pickup', opening], ['dropoff', closing]]) {
      const approaching = frames.filter(s => s.modal && s.clipHeight > 241 && s.sheetY > dockY + 8);
      const joint = frames.filter(s => s.modal && s.clipHeight > 241 && s.y < dockY - 8 && s.y > opened.y + 8);
      if (approaching.length < 2 || Math.max(...approaching.map(s => s.sheetY)) -
          Math.min(...approaching.map(s => s.sheetY)) < 8 || joint.length < 2)
        throw Error('Missing visible sheet approach or joint cartridge travel during ' + stage + ': ' +
          JSON.stringify({ layout, dockY, headerY: opened.y, approach: approaching.map(s => s.sheetY), joint: joint.map(s => s.y) }));
    }
    for (const index of [reopened, reclosed]) {
      const before = samples[index - 1], after = samples[index];
      if (Math.abs(after.y - before.y) > Math.max(10, (after.time - before.time) * 3))
        throw Error('Reversing the moving inventory snapped its shell');
    }
  }
  let dock, transport, material, motion;
  for (const url of entries) {
    await checkInventoryTravel(url, 'clipped');
    await checkInventoryTravel(url, 'resizing');
    await page.goto(url);
    const world = page.getByRole('tab', { name: 'World', exact: true });
    await page.locator('[data-skin=hardware]').waitFor();
    const btn = (name) => page.getByRole('button', { name, exact: true });
    const slots = page.getByRole('group', { name: 'Hotbar slots' });
    const original = await slots.evaluateHandle(el => [el, ...el.querySelectorAll('button')]);
    const sameSlots = () => slots.evaluate((el, nodes) => {
      const current = [el, ...el.querySelectorAll('button')];
      return nodes.length === 7 && current.length === 7 && current.every((node, i) => node === nodes[i]);
    }, original);
    await btn('Inventory').click();
    await btn(/^Slot 1, Clay dust$/i).waitFor();
    if (!await sameSlots()) throw Error('Packaged panel remounted its hotbar when opened');
    const catalog = page.getByRole('region', { name: 'Material catalog' });
    if (await catalog.getByRole('button').count() !== 56) throw Error('Incomplete packaged catalog');
    await page.getByLabel('Search materials').fill('Slush');
    await catalog.getByRole('button', { name: 'Slush', exact: true }).click();
    await btn('Assign').click();
    await btn('Slot 3, Vinegar').click();
    await btn('Slot 3, Slush').waitFor();
    await btn('Use').click();
    await btn('Slush').waitFor();
    if (!await sameSlots()) throw Error('Packaged panel remounted its hotbar on return');
    await btn('Slush').click();
    const sourceKey = slots.locator('[aria-label="Slush"][data-source="true"]');
    await sourceKey.waitFor();
    if (await page.getByRole('button', { name: /Place source/i }).count())
      throw Error('Source placement exposed a second action beside the selected key');
    if (!await sourceKey.evaluate(el => getComputedStyle(el, '::after').boxShadow !== 'none'))
      throw Error('Selected source key has no underglow');
    await original.dispose();
    await page.evaluate(() => { window.deferPlaybackEcho = true; });
    const play = btn('Play');
    const cap = play.locator('[data-kit="code-copy"]');
    await page.evaluate(() => document.fonts.ready);
    const restingX = await cap.evaluate(el => el.getBoundingClientRect().x);
    const seam = await page.locator('.sw-face').boundingBox();
    const playCap = await cap.boundingBox();
    const seamRight = seam.x + seam.width;
    if (playCap.x + playCap.width <= seamRight + 2) throw Error('Play cap sits on the front face');
    await page.mouse.move((seamRight + playCap.x + playCap.width) / 2, playCap.y + playCap.height / 2);
    await page.mouse.down();
    await page.waitForFunction((x) => {
      const key = document.querySelector('[aria-label="Playback"] button [data-kit="code-copy"]');
      return key.getBoundingClientRect().x < x - 1;
    }, restingX);
    await page.mouse.up();
    await page.waitForFunction((x) => {
      const key = document.querySelector('[aria-label="Playback"] button [data-kit="code-copy"]');
      return window.finishPlayback && Math.abs(key.getBoundingClientRect().x - x) < 0.25;
    }, restingX);
    // Sample through the delayed native echo. A pressed-state transform would move the cap again.
    const echoTravel = await cap.evaluate(async (el, x) => {
      window.finishPlayback();
      let distance = 0;
      const start = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        distance = Math.max(distance, Math.abs(el.getBoundingClientRect().x - x));
      } while (performance.now() - start < 240);
      return distance;
    }, restingX);
    if (echoTravel > 0.5) throw Error('Play cap moved ' + echoTravel + 'px on the playback echo');
    await btn('Stop').waitFor();
    if (!(await btn('Step').isDisabled())) throw Error('Packaged Step enabled while playing');
    const agitateCap = btn('Agitate').locator('[data-kit="code-copy"]');
    const agitateBounds = await agitateCap.boundingBox();
    if (agitateBounds.x >= seam.x - 2) throw Error('Agitate cap sits on the front face');
    await page.mouse.move((seam.x + agitateBounds.x) / 2, agitateBounds.y + agitateBounds.height / 2);
    await page.mouse.down();
    await page.waitForFunction(({ cap, x }) => cap.getBoundingClientRect().x > x + 1,
      { cap: await agitateCap.elementHandle(), x: agitateBounds.x }, { timeout: 1500 });
    await page.mouse.up();
    await page.waitForFunction(() => window.agitations === 1);
    await btn('Stop').click();
    await btn('Play').waitFor();
    await btn('Step').click();
    await page.waitForFunction(() => window.transportActions.length === 3);
    transport = await page.evaluate(() => window.transportActions);
    if (transport.join(',') !== 'onPlayback,onPlayback,onStep')
      throw Error('Packaged transport bridge failed');
    await page.getByRole('tab', { name: 'Thermal', exact: true }).click();
    const knob = page.getByRole('spinbutton', { name: 'Thermal power', exact: true });
    await knob.press('Home');
    await knob.press('End');
    const brush = page.getByRole('slider', { name: 'Brush size', exact: true });
    for (const [key, stop] of [['Home','Fine'], ['ArrowUp','Medium'], ['End','Wide']]) {
      await brush.press(key);
      await page.locator('[aria-label="Brush size"][aria-valuetext="' + stop + '"]').waitFor();
    }
    await brush.press('Home');
    const rail = await brush.boundingBox();
    const midX = rail.x + rail.width / 2;
    const color = () => brush.evaluate(el => getComputedStyle(el.closest('label')).getPropertyValue('--brush-color'));
    const fineColor = await color();
    await page.mouse.move(midX, rail.y + rail.height - 3);
    await page.mouse.down();
    await page.mouse.move(midX, rail.y + rail.height * 0.65);
    const intermediate = Number(await brush.inputValue());
    const middleColor = await color();
    await page.mouse.move(midX, rail.y + rail.height / 2);
    await page.mouse.up();
    await page.locator('[aria-label="Brush size"][aria-valuetext="Medium"]').waitFor();
    if (!(intermediate > 0 && intermediate < 1) || fineColor === middleColor || middleColor === await color())
      throw Error('Brush slider did not interpolate and snap during a drag');
    await btn('Probe').click();
    await page.getByRole('group', { name: 'Probe readings' }).waitFor();
    await btn('Heat').click();
    await page.getByRole('group', { name: 'Probe readings' }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('.sw-readings output')?.textContent === '155°C',
    );
    await btn('Probe only').click();
    await btn('Close probe').click();
    await btn('Probe').waitFor();
    await world.click();
    const cartridge = page.getByRole('region', { name: 'Tool cartridge' });
    await cartridge.getByRole('button', { name: 'Save', exact: true }).waitFor();
    const cameras = page.getByRole('group', { name: 'Camera' });
    const cameraBounds = await cameras.boundingBox();
    const screenBounds = await cartridge.boundingBox();
    if (cameraBounds.y < screenBounds.y + screenBounds.height - 1)
      throw Error('Camera controls overlap the World cartridge');
    const check = (name) => page.getByRole('checkbox', { name, exact: true });
    const clicks = ['Pressure', 'Air', 'Heat', 'Pressure', 'Normal'];
    const expected = [
      ['Pressure', true],
      ['Air', true],
      ['Heat', true],
      ['Pressure', false],
      ['Normal', true],
    ];
    const states = [
      ['Pressure'],
      ['Pressure', 'Air'],
      ['Pressure', 'Air', 'Heat'],
      ['Air', 'Heat'],
      ['Normal'],
    ];
    for (const [i, name] of clicks.entries()) {
      await check(name).click();
      await page.waitForFunction((n) => window.observedActions.length === n, i + 1, {
        timeout: 2500,
      });
      // A native action is posted before React commits the echoed props in the DOM panel.
      await page.waitForFunction(
        (expected) => {
          const controls = [...document.querySelectorAll('[data-kit="checkbox"]')];
          return (
            controls.length === 4 &&
            controls.every(
              (control) =>
                (control.getAttribute('aria-checked') === 'true') ===
                expected.includes(control.getAttribute('aria-label')),
            )
          );
        },
        states[i],
        { timeout: 2500 },
      );
    }
    const actual = await page.evaluate(() => window.observedActions);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error('Unexpected bridge payload: ' + JSON.stringify(actual));
    dock = actual;
    await page.getByRole('tab', { name: 'Air', exact: true }).click();
    const motionButton = btn('Motion');
    await motionButton.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const face = page.locator('.sw-face');
    await face
      .locator('[data-kit="tab-panel"][data-ending-style]')
      .first()
      .waitFor({ state: 'hidden' });
    const dockBounds = await face.boundingBox();
    for (const [i, granted] of [false, true, true].entries()) {
      await motionButton.tap();
      await page.waitForFunction((n) => window.motionActions.length === n, i + 1);
      await page.locator('button[aria-pressed]:disabled', { hasText: /^motion$/i }).waitFor();
      await page.evaluate((allow) => window.finishMotion(allow), granted);
      await page.getByRole('button', { name: 'Motion', exact: true, pressed: i === 1 }).waitFor();
      if (i === 0) await page.getByText('Motion access denied.', { exact: true }).waitFor();
      const currentBounds = await face.boundingBox();
      if (JSON.stringify(currentBounds) !== JSON.stringify(dockBounds))
        throw Error(
          'Motion controls resized the dock: ' + JSON.stringify({ dockBounds, currentBounds }),
        );
    }
    const motionActions = await page.evaluate(() => window.motionActions);
    if (JSON.stringify(motionActions) !== '[true,true,false]') throw Error('Motion action payload');
    motion = 'Motion opt-in, denial, retry and opt-out crossed the bridge with fixed dock bounds.';
    await page.getByRole('tab', { name: 'Materials', exact: true }).click();
    await btn('Inventory').click();
    await btn('New material').click();
    const dialog = page.getByRole('dialog', { name: /^(New|Edit) material$/ });
    await btn('Create material').click();
    await dialog.getByText('Enter a material name.').waitFor();
    await dialog.getByLabel('Name', { exact: true }).fill('Glaze');
    await btn('Add reaction').click();
    await dialog.getByLabel('Touches').selectOption({ label: 'Water' });
    await dialog.getByLabel('Contact material becomes').selectOption({ label: 'Glass' });
    await btn('Create material').click();
    await dialog.waitFor({ state: 'hidden' });
    await catalog.getByRole('button', { name: 'Glaze', exact: true }).click();
    await btn('Edit material').click();
    await dialog.getByLabel('Name', { exact: true }).fill('Green glaze');
    await btn('Apply changes').click();
    await dialog.waitFor({ state: 'hidden' });
    await catalog.getByRole('button', { name: 'Green glaze', exact: true }).waitFor();
    await btn('Close inventory').click();
    await world.click();
    await btn('Save').click();
    await page.getByText('World saved.', { exact: true }).waitFor();
    await page.waitForFunction(() => window.editorActions.length === 8);
    const actions = await page.evaluate(() => window.editorActions);
    const expectedActions = [
      'onEditorVisibility',
      'onMaterial',
      'onMaterial',
      'onEditorVisibility',
      'onEditorVisibility',
      'onMaterial',
      'onEditorVisibility',
      'onSave',
    ];
    if (actions.some(([action], i) => action !== expectedActions[i]))
      throw Error('Unexpected editor bridge calls ' + JSON.stringify(actions));
    const [, [created, draft]] = actions[2];
    const [, [edited, edit]] = actions[5];
    if (
      created !== null ||
      edited !== 17 ||
      draft.name !== 'Glaze' ||
      edit.name !== 'Green glaze' ||
      JSON.stringify(edit.rules) !== JSON.stringify([{ with: 7, own: null, other: 12 }])
    )
      throw Error('Unexpected material payload ' + JSON.stringify(actions));
    material =
      'Exported editor, validation result, stable edit ID and World Save crossed the iOS bridge.';
  }
  if (!transport || !dock || !material || !motion) throw Error('Missing SPEC-01 panel');
  return { dock, transport, material, motion };
};
