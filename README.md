# Siftwake

A falling-sand wind tunnel for Expo. The top passage contains smoke, the middle passage compares sand with gravel, and the bottom passage lets you blow flame between two pieces of wood.

Choose **Water** in Materials to fill a basin. Where water touches dry sand, a grain turns darker and holds a steeper pile.

## Play on a PC

Install Node.js 22.15 or newer with npm. From the project directory run:

```sh
npm ci
npm run web
```

Open the local URL printed by Expo. The scene starts paused. Press **Play** to run it, **Stop** to freeze it or **Step** to advance one tick. In **Air**, drag the white knob to set the strength of the next fan. The numeric readout also accepts Up and Down for one-percent adjustments. Each fan keeps its own strength. Select **Fan** and tap a placed fan to rotate it. **Build** holds walls and the eraser. **World** holds reset, scene switching and the camera overlays.

### Materials, brushes and sources

New worlds start with Clay Dust, Baking Soda, Vinegar, Copper, Wax and Flame on six editable keys. Existing worlds keep their bindings. Press the seventh key, the pixel grid, to open **Inventory** and search 56 built-ins or filter by group. Tap a card for its behavior and an experiment to try. **Use** equips it for painting. Hold the card or press **Assign** to fill the first empty slot. When all six slots are full, choose the one to replace or cancel. Select a bound material in the inventory to **Clear slot**.

Hold a material, Heat or Cool brush against the canvas during playback to apply it on successive ticks. In brush mode, a tap while paused edits immediately. Tap an equipped mobile material, Heat or Cool again to switch to source placement. The selected key turns black. A glow beneath it identifies a material source by its color, a heater by amber and a cooler by icy blue. Set Fine, Medium or Wide with the left brush slider and adjust the knob on the **Thermal** tab before placing a heat or cooling source on an empty tile. Each source keeps those settings and emits when the world advances. Use **Build → Erase** to remove it.

| Inventory group | Experiment |
| --- | --- |
| Weather | Add carbon dioxide to cool water in a pressurized chamber. Vent the chamber and press **Agitate** on the left side during playback to release dissolved gas. |
| Chemistry | Mix plaster and water to make warm gypsum. Hydrate clay dust, dry the clay, then fire it into brick. |
| Engineering | Heat tin and copper side by side. Tin melts first. Cool the molten metals to cast them back into solids. |
| Garden | Put a seed against wet soil with room for a stem and roots. Follow water from the roots into the growing plant. |

The controls use the [published SPEC-01 registry](https://github.com/shuding/spec-01/tree/b8f91b6646d9280d9de8e0f5b2c6453cb4f237cb/registry/hardware). Expo Web renders its React components directly. On iPhone, Expo DOM hosts the transport and hotbar in one fixed dock. Skia renders the native canvas, and the simulation stays in the app. The skin, textures and Spec Mono font ship with the project.

The vendored files in `vendor/spec-01` come from that pinned commit. Siftwake extends Button Group with pressed and disabled states and Flat Knob with adjustable accessibility semantics and Home/End keys. Postinstall flattens the registry's skin import list for Metro. The UI SDK dependencies use the public beta.10 release. Licenses are in `licenses/`.

## Temperature and cameras

In **World**, latch a SPEC-01 camera checkbox. Pressure colors low-pressure air blue and high-pressure air amber. Air adds moving streamlines with arrowheads. Heat uses a fixed Celsius scale and shows the last sampled temperature. Toggle any combination while painting. With Heat active, Pressure uses sparse blue or amber markings over the temperature scale. Normal clears every layer.

Select **Thermal → Probe** to view live readings on the cartridge display. In Probe, press the snowflake on the left or the dragon on the right to cool or heat the cell you touch. Press the readout to return to inspection alone. Touch a cell to read temperature, signed pressure, and airflow speed and direction. Pressure and airflow use simulation units. The side keys control playback and single-step.

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

Exercise the production web game and the DOM controls bundled with the iOS export locally:

```sh
npx expo export --platform ios --dump-assetmap --output-dir output/expansion-ios
npx expo export --platform web --output-dir output/expansion-web
npx playwright install chromium
node scripts/check-export.mjs output/expansion-ios output/expansion-web
```

The packaged-panel checks run in Chromium with an emulated native bridge. The physical iPhone protocol and its separate performance threshold are in the [game specification](SPEC.md).

## Custom materials and saves

Open the Materials inventory and press the paper-and-pencil button at the bottom right. Give it a name and color, choose how it moves, and set its density from 1 to 100. Use **Add reaction** to pick a contact material and the result for each of the two touching cells. **Create material** selects it for painting. Pick it in the inventory and choose **Edit** to change it in place. The editor pauses the simulation so you can inspect the result before pressing Step or Play.

**World → Save** writes the current world and custom catalog to the local slot. Siftwake also saves during play and on backgrounding. Reopening restores the saved world paused. The iPhone uses SQLite, and Expo Web uses browser storage.

A contact rule can also require a temperature range in °C or a signed pressure range in simulation units. Leave an endpoint blank to omit that limit. A rule that transforms materials can heat or cool the products. Saved worlds retain custom IDs, the hotbar, source settings and fan strengths. If the latest checkpoint is unreadable, the previous readable world opens read-only so both generations are preserved.

## Phone motion

On iPhone, open **Air → Motion** and allow access when prompted. Press **Play**, then rotate or tilt the phone. Loose powders and liquids fall toward the lowest edge or corner, and gases rise in the opposite direction. This applies to materials already on the board. A quick shake jostles loose materials and stirs gases. The world ignores phone motion while paused, including when you press **Step**. The switch is saved with the world and can be turned off in **Air**.

## iPhone updates

In LiveContainer, open **Sources → +** and add the [Siftwake source](https://raw.githubusercontent.com/jeemzy/siftwake/main/distribution/livecontainer.json). The source lists stable IPAs newest first. Use **Refresh** in LiveContainer to see newly published releases.

Install the unsigned IPA from the latest GitHub release. Its production channel checks at launch and when you return to the game, at most once a minute. A downloaded update offers **Restart to update** or **Later**. If you defer it, you can restart from **World**. Restart saves the current world and custom catalog to SQLite and restores them paused. The installed game also checkpoints dirty sessions every 15 seconds and on backgrounding.

The Linux publishing workflow tests the game, exports iOS, exercises the exported toolbar, and compares the candidate runtime to the fingerprint attached to the latest iPhone release. Compatible app changes merged to main publish to the linked Expo project using the repository secret EXPO_TOKEN. After a native change, run **Build unsigned iPhone IPA**, install that release, then dispatch **Publish iPhone OTA** or merge the next game change. A previous compatible update can be republished from the Expo dashboard.
