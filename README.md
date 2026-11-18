# Siftwake

A falling-sand wind tunnel for Expo. The top passage contains smoke, the middle passage compares sand with gravel, and the bottom passage lets you blow flame between two pieces of wood.

Choose **Water** in Materials to fill a basin. Where water touches dry sand, a grain turns darker and holds a steeper pile.

## Play on a PC

Install Node.js 22.15 or newer with npm. From the project directory run:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo. The scene starts paused. Tap a bottom hotbar category to reveal its items. **Materials** holds the grains, smoke, wood, and flame. **Air** holds the fan strength slider, fans, gusts, pressure, and suction. The slider adjusts every fan together. Select **Fan** and tap a placed fan to rotate it. **Build** holds walls and the eraser. **World** holds reset, scene switching, and the pressure overlay. Draw directly on the canvas while paused or playing. **Step** advances one tick.

## Checks

```sh
npm test
npm run typecheck
```

With the server running, the browser check uses Playwright CLI and Chrome:

```sh
npx --yes --package @playwright/cli playwright-cli -s=siftwake open http://localhost:8081 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=siftwake run-code --filename tests/tunnel.playwright.js
npx --yes --package @playwright/cli playwright-cli -s=siftwake run-code --filename tests/water.playwright.js
```

The first milestone runs locally without an Xcode build. The [game specification](SPEC.md) covers the editor, saved worlds, and subsequent iPhone validation.
