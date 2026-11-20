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
    ];
    const props = {
      groups: {
        Materials: ['Sand'],
        Air: ['Fan'],
        Build: ['Wall'],
        Thermal: ['Heat', 'Cool', 'Probe'],
        World: [],
      },
      tool: 'Sand',
      camera: { Pressure: false, Air: false, Heat: false },
      reading: null,
      probe: null,
      swatches: {},
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
    };
    const emit = (type, data) =>
      window.dispatchEvent(new CustomEvent('$$dom_event', { detail: { type, data } }));
    window.observedActions = [];
    window.transportActions = [];
    window.editorActions = [];
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
        }
        if (actionId === 'onStep') window.transportActions.push(actionId);
        if (actionId === 'onTool') {
          props.tool = args[0];
          props.probe = { temperature: 155, pressure: 0.01, speed: 1.54, direction: 'E' };
        }
        if (actionId === 'onCategory') props.category = args[0];
        if (actionId === 'onEditorVisibility') {
          props.expanded = args[0];
          window.editorActions.push([actionId, args]);
        }
        if (actionId === 'onSave') {
          window.editorActions.push([actionId, args]);
          result = 'World saved.';
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
  let dock, transport, material;
  for (const url of entries) {
    await page.goto(url);
    const world = page.getByRole('tab', { name: 'World', exact: true });
    await page.locator('[data-skin=hardware]').waitFor();
    const btn = (name) => page.getByRole('button', { name, exact: true });
    await btn('Play').click();
    await btn('Stop').waitFor();
    if (!(await btn('Step').isDisabled())) throw Error('Packaged Step enabled while playing');
    await btn('Stop').click();
    await btn('Play').waitFor();
    await btn('Step').click();
    await page.waitForFunction(() => window.transportActions.length === 3);
    transport = await page.evaluate(() => window.transportActions);
    if (transport.join(',') !== 'onPlayback,onPlayback,onStep')
      throw Error('Packaged transport bridge failed');
    await page.getByRole('tab', { name: 'Thermal', exact: true }).click();
    await btn('Probe').click();
    await page.getByRole('group', { name: 'Probe readings' }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('.sw-readings output')?.textContent === '155°C',
    );
    await world.click();
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
    await page.getByRole('tab', { name: 'Materials', exact: true }).click();
    await btn('Sand').click();
    await btn('New material').click();
    const dialog = page.getByRole('dialog');
    await btn('Create material').click();
    await dialog.getByText('Enter a material name.').waitFor();
    await dialog.getByLabel('Name', { exact: true }).fill('Glaze');
    await btn('Add reaction').click();
    await dialog.getByLabel('Touches').selectOption({ label: 'Water' });
    await dialog.getByLabel('Contact material becomes').selectOption({ label: 'Glass' });
    await btn('Create material').click();
    await dialog.waitFor({ state: 'hidden' });
    const palette = page.getByLabel('Custom material', { exact: true });
    await palette.getByRole('option', { name: 'Glaze' }).waitFor({ state: 'attached' });
    await btn('Edit material').click();
    await dialog.getByLabel('Name', { exact: true }).fill('Green glaze');
    await btn('Apply changes').click();
    await dialog.waitFor({ state: 'hidden' });
    await palette.getByRole('option', { name: 'Green glaze' }).waitFor({ state: 'attached' });
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
  if (!transport || !dock || !material) throw Error('Missing SPEC-01 panel');
  return { dock, transport, material };
};
