# Siftwake

A falling-sand wind tunnel for Expo. The top passage contains smoke, the middle passage compares sand with gravel, and the bottom passage lets you blow flame between two pieces of wood.

Choose **Water** in Materials to fill a basin. Where water touches dry sand, a grain turns darker and holds a steeper pile.

## Play on a PC

Install Node.js 22.15 or newer with npm. From the project directory run:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo. The scene starts paused. Tap a bottom hotbar category to reveal its items. **Materials** holds the grains, smoke, wood, and flame. **Air** holds the fan strength knob, fans, gusts, pressure, and suction. Drag the white knob up or down to adjust all fans together. Focus the numeric readout and press Up or Down for one-percent adjustments. Stop freezes the current world and enables Step. Select **Fan** and tap a placed fan to rotate it. **Build** holds walls and the eraser. **World** holds reset, scene switching, and the pressure overlay. Draw directly on the canvas while paused or playing. **Step** advances one tick.

The controls use the [published SPEC-01 registry](https://github.com/shuding/spec-01/tree/b8f91b6646d9280d9de8e0f5b2c6453cb4f237cb/registry/hardware). Expo Web renders its React components directly. On iPhone, Expo DOM hosts the transport and hotbar in one fixed dock. Skia renders the native canvas, and the simulation stays in the app. The skin, textures and Spec Mono font ship with the project.

The vendored files in `vendor/spec-01` come from that pinned commit. Siftwake extends Button Group with pressed and disabled states and Flat Knob with adjustable accessibility semantics and Home/End keys. Postinstall flattens the registry's skin import list for Metro. The UI SDK dependencies use the public beta.10 release. Licenses are in `licenses/`.

## Temperature and cameras

In **World**, latch a SPEC-01 camera checkbox. Pressure colors low-pressure air blue and high-pressure air amber. Air adds moving streamlines with arrowheads. Heat uses a fixed Celsius scale and shows the last sampled temperature. Toggle any combination while painting. With Heat active, Pressure uses sparse blue or amber markings over the temperature scale. Normal clears every layer.

Select **Thermal → Probe** to slide the backlit display out of the dock. Touch a cell to read temperature, signed pressure, and airflow speed and direction. Pressure and airflow use simulation units. The side keys control playback and single-step.

Use **Thermal → Heat or Cool** on a material or empty air. Brush edits work while paused. Press Step or Play to conduct heat, blow it downwind and change phase. Ice melts, water boils, steam condenses and wet sand dries. Around 1,050 °C gravel melts into lava, and around 1,500 °C sand melts into glass. Continued heating supplies the energy for each change. Cooling produces solid rock or glass. Sustained heat chars wood, then exposed char burns down to ash. Water can put it out.

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
npx --yes --package @playwright/cli playwright-cli -s=siftwake run-code --filename tests/cameras.playwright.js
```

The first milestone runs locally without an Xcode build. The [game specification](SPEC.md) covers the editor, saved worlds, and subsequent iPhone validation.

## iPhone updates

Install the unsigned IPA from the latest GitHub release. Its production channel checks at launch and when you return to the game, at most once a minute. A downloaded update offers **Restart to update** or **Later**. If you defer it, you can restart from **World**. Restart saves the current world and editor to SQLite and restores it paused. The installed game also checkpoints dirty sessions every 15 seconds and on backgrounding.

The Linux publishing workflow tests the game, exports iOS, exercises the exported toolbar, and compares the candidate runtime to the fingerprint attached to the latest iPhone release. Compatible app changes merged to main publish to the linked Expo project using the repository secret EXPO_TOKEN. After a native change, run **Build unsigned iPhone IPA**, install that release, then dispatch **Publish iPhone OTA** or merge the next game change. A previous compatible update can be republished from the Expo dashboard.
