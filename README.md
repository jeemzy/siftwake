# Siftwake

A falling-sand wind tunnel for Expo. The top passage contains smoke, the middle passage compares sand with gravel, and the bottom passage lets you blow flame between two pieces of wood.

## Play on a PC

Install Node.js 22.15 or newer with npm. From the project directory run:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo. The scene starts paused. Set **Fan strength**, then press **Play** or **Step**. The slider adjusts every fan together for repeatable comparisons. Choose **Fan** and tap a fan to rotate it. **Wind** applies a gust along a stroke. **Reset** restores the current scene and its original seed. **Blank canvas** opens an empty world.

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
