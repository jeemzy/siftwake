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
      category:'Materials', power:55, sceneGeneration:0, updateReady:false,
      scene: 'Blank',
      feedback: '',
      paused: true,
    };
    const emit = (type, data) =>
      window.dispatchEvent(new CustomEvent('$$dom_event', { detail: { type, data } }));
    window.observedActions = [];
    window.transportActions = [];
    window.ReactNativeWebView = {
      injectedObjectJson: () =>
        JSON.stringify({ EXPO_DOM_HOST_OS: 'ios', initialProps: { names, props } }),
      postMessage(raw) {
        const message = JSON.parse(raw);
        if (message.type !== '$$native_action') return;
        const { actionId, uid, args } = message.data;
        if(actionId==='onPlayback'){props.paused=!props.paused;window.transportActions.push(actionId);}
        if(actionId==='onStep')window.transportActions.push(actionId);
        if (actionId === 'onCategory') props.category=args[0];
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
  let dock, transport;
  for (const url of entries) {
    await page.goto(url);
    const world = page.getByRole('tab', { name: 'World', exact: true });
    await page.locator('[data-skin=hardware]').waitFor();
    if (!(await world.count())) {
      const btn=name=>page.getByRole('button',{name,exact:true});
      await btn('Play').click();await btn('Stop').waitFor();
      if(!await btn('Step').isDisabled())throw Error('Packaged Step enabled while playing');
      await btn('Stop').click();await btn('Play').waitFor();await btn('Step').click();
      await page.waitForFunction(()=>window.transportActions.length===3);
      transport=await page.evaluate(()=>window.transportActions);
      if(transport.join(',')!=='onPlayback,onPlayback,onStep')throw Error('Packaged transport bridge failed');
      continue;
    }
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
      await page.waitForFunction(expected => {
        const controls = [...document.querySelectorAll('[data-kit="checkbox"]')];
        return controls.length === 4 && controls.every(control =>
          (control.getAttribute('aria-checked') === 'true') === expected.includes(control.getAttribute('aria-label'))
        );
      }, states[i], {timeout:2500});
    }
    const actual = await page.evaluate(() => window.observedActions);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error('Unexpected bridge payload: ' + JSON.stringify(actual));
    dock=actual;
  }
  if(!transport || !dock)throw Error('Missing SPEC-01 panel');
  return {dock,transport};
}
