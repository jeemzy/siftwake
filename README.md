# Siftwake

A falling-sand wind tunnel for Expo. The top passage contains smoke, the middle passage compares sand with gravel, and the bottom passage lets you blow flame between two pieces of wood.

## Play on a PC

Install Node.js 22.15 or newer with npm. From the project directory run:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo. The scene starts paused. Tap a bottom hotbar category to reveal its items. **Materials** holds the grains, smoke, wood, and flame. **Air** holds the fan strength knob, fans, gusts, pressure, and suction. Drag the white knob up or down to adjust all fans together. Focus the numeric readout and press Up or Down for one-percent adjustments. Stop freezes the current world and enables Step. Select **Fan** and tap a placed fan to rotate it. **Build** holds walls and the eraser. **World** holds reset, scene switching, and the pressure overlay. Draw directly on the canvas while paused or playing. **Step** advances one tick.

The controls use the [published SPEC-01 registry](https://github.com/shuding/spec-01/tree/b8f91b6646d9280d9de8e0f5b2c6453cb4f237cb/registry/hardware). Expo Web renders its React components directly. On iPhone, Expo DOM hosts the transport and hotbar in two fixed panel views. Skia renders the native canvas, and the simulation stays in the app. The skin, textures and Spec Mono font ship with the project.

The vendored files in `vendor/spec-01` come from that pinned commit. Siftwake extends Button Group with pressed and disabled states and Flat Knob with adjustable accessibility semantics and Home/End keys. Postinstall flattens the registry's skin import list for Metro. The UI SDK dependencies use the public beta.10 release. Licenses are in `licenses/`.

## Checks

```sh
npm test
npm run typecheck
```

With the server running, the browser check uses Playwright CLI and Chrome:

```sh
npx --yes --package @playwright/cli playwright-cli -s=siftwake open http://localhost:8081 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=siftwake run-code --filename tests/tunnel.playwright.js
```

The first milestone runs locally without an Xcode build. The [game specification](SPEC.md) covers the editor, saved worlds, and subsequent iPhone validation.
