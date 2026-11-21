import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, extname, basename, sep } from 'node:path';
import { createServer } from 'node:http';
import { runInThisContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ota = resolve(process.argv[2] ?? 'dist-ota'),
  web = resolve(process.argv[3] ?? 'dist-web');
const manifest = JSON.parse(readFileSync(resolve(ota, 'metadata.json'))).fileMetadata.ios;
const files = new Set(manifest.assets.map((asset) => asset.path));
for (const path of [manifest.bundle, ...files]) assert(statSync(resolve(ota, path)).size > 0, path);
const panels = [...files].filter((path) => path.endsWith('.html'));
assert.equal(panels.length, 1);
for (const html of panels) {
  const text = readFileSync(resolve(ota, html), 'utf8');
  for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const asset = new URL(match[1], 'http://assets/' + html);
    assert(files.has(asset.pathname.slice(1)), 'Missing published panel asset ' + asset.pathname);
  }
}
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  if (path === '/panels/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(panels.map((p) => '<a href="/panels/' + basename(p) + '">Panel</a>').join(''));
    return;
  }
  const panel = path.startsWith('/panels/'),
    root = panel ? resolve(ota, 'www.bundle') : web;
  const file = resolve(
    root,
    '.' + (panel ? path.slice('/panels'.length) : path === '/' ? '/index.html' : path),
  );
  if (
    relative(root, file).split(sep).includes('..') ||
    !existsSync(file) ||
    !statSync(file).isFile()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    args: ['--enable-unsafe-swiftshader'],
  });
  const legacy = gunzipSync(readFileSync('tests/fixtures/world-0.3.0.bin.gz')).toString('base64');
  const legacyV2 = gunzipSync(readFileSync('tests/fixtures/world-bd283ab-v2.bin.gz')).toString(
    'base64',
  );
  const scenario = (name) =>
    runInThisContext(readFileSync('tests/' + name + '.playwright.js', 'utf8'), {
      filename: 'tests/' + name + '.playwright.js',
    });
  const failures = [];
  const selected = process.argv.slice(4);
  const cases = [
    ['tunnel', '/'],
    ['water', '/'],
    ['cameras', '/'],
    ['probe', '/'],
    ['inventory', '/', { width: 320, height: 568 }],
    ['devices', '/', { width: 375, height: 667 }],
    ['replay', '/'],
    ['material-editor', '/', { width: 375, height: 667 }],
    ['material-editor', '/', { width: 393, height: 852 }],
    ['ipa-controls', '/panels/', { width: 320, height: 568 }],
    ['ipa-controls', '/panels/', { width: 375, height: 667 }],
    ['ipa-controls', '/panels/', { width: 393, height: 852 }],
  ];
  for (const name of selected)
    assert(
      cases.some(([test]) => test === name),
      'Unknown scenario ' + name,
    );
  for (const [test, path, viewport] of cases) {
    if (selected.length && !selected.includes(test)) continue;
    const page = await browser.newPage(
      viewport
        ? { viewport, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) pageErrors.push(response.status() + ' ' + response.url());
    });
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + path);
      const run = scenario(test);
      const result = await run(page, legacy, legacyV2);
      assert.deepEqual(pageErrors, []);
      console.log(test, viewport ? `${viewport.width}x${viewport.height}` : '', result);
    } catch (error) {
      failures.push(new Error(test + ' ' + (viewport?.width ?? 'desktop'), { cause: error }));
      console.error(test, viewport?.width ?? 'desktop', error, pageErrors);
    } finally {
      await page.close();
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Export scenarios failed');
} finally {
  await browser?.close();
  server.close();
}
