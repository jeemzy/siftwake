const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// Metro's development CSS loader does not follow the registry's CSS @imports.
// Flatten its entry point in the published order for both Expo DOM and web.
const skin = join(__dirname, '../vendor/spec-01/registry/hardware/ui/hardware');
const entry = readFileSync(join(skin, 'skin.css'), 'utf8');
const css = entry.replace(/@import "\.\/([^"]+)";/g, (_, filename) =>
  readFileSync(join(skin, filename), 'utf8'),
);
writeFileSync(join(skin, 'skin.metro.css'), css);
