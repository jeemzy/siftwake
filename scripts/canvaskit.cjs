const fs = require('node:fs');
const path = require('node:path');
const skia = path.dirname(require.resolve('@shopify/react-native-skia/package.json'));
const wasm = require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm', { paths: [skia] });
fs.mkdirSync('public', { recursive: true });
fs.copyFileSync(wasm, 'public/canvaskit.wasm');
