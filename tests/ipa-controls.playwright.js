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
    ];
    const props = {
      groups: {
        Materials: ['Sand'],
        Air: ['Fan'],
        Build: ['Wall'],
        Thermal: ['Heat', 'Cool'],
        World: [],
      },
      tool: 'Sand',
      camera: { Pressure: false, Air: false, Heat: false },
      reading: null,
      swatches: {},
      brush: 1,
      resetId: 0,
      scene: 'Blank',
      feedback: '',
      paused: true,
    };
    const emit = (type, data) =>
      window.dispatchEvent(new CustomEvent('$$dom_event', { detail: { type, data } }));
    window.observedActions = [];
    window.ReactNativeWebView = {
      injectedObjectJson: () =>
        JSON.stringify({ EXPO_DOM_HOST_OS: 'ios', initialProps: { names, props } }),
      postMessage(raw) {
        const message = JSON.parse(raw);
        if (message.type !== '$$native_action') return;
        const { actionId, uid, args } = message.data;
        if (actionId === 'onViewChange') {
          window.observedActions.push(args);
          const [key, enabled] = args;
          if (key === 'Normal') props.camera = { Pressure: false, Air: false, Heat: false };
          else props.camera = { ...props.camera, [key]: enabled };
        }
        queueMicrotask(() => {
          emit('$$native_action_result', { actionId, uid, result: null });
          emit('$$props', { names, props });
        });
      },
    };
  });
  for (const url of entries) {
    await page.goto(url);
    const world = page.getByRole('tab', { name: 'World', exact: true });
    await page.locator('[data-skin=hardware]').waitFor();
    if (!(await world.count())) continue;
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
      for (const key of ['Pressure', 'Air', 'Heat', 'Normal']) {
        if ((await check(key).isChecked()) !== states[i].includes(key))
          throw Error('Wrong host-confirmed state: ' + key);
      }
    }
    const actual = await page.evaluate(() => window.observedActions);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error('Unexpected bridge payload: ' + JSON.stringify(actual));
    return actual;
  }
  throw Error('Missing SPEC-01 panel in IPA');
}
