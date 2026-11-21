# Siftwake

An ad-free falling-sand game for iPhone. Draw a tunnel, release smoke, aim a fan down the passage, and cut an opening to see how the flow changes.

## Problem Statement

I want a falling-sand sandbox I can play on my iPhone without ads or a paid unlock. I want to invent a material on the phone and immediately see how it behaves alongside sand, water, and smoke. Air should be part of the experiment. A wall should hold a pressure difference, and opening it should change where smoke goes.

I develop on Windows and have a physical iPhone. Everyday changes to materials, physics, and controls should be playable on that phone without spending a macOS runner build on each iteration.

## Solution

Build Siftwake as an Expo app with a touch canvas, a fixed-step simulation, and a local material editor. Launch it in Expo Go from a Windows development server. The player can paint, pause, advance one tick, build chambers, place air devices, and save a world together with the materials it uses. The play screen has no advertising, purchases, or game-account prompt.

Siftwake renders the chamber with Skia. Four references informed the material and tool choices.

| Game | Documented behavior | How Siftwake uses the idea |
| --- | --- | --- |
| Powder Game on iOS | A fan supplies wind continuously. Pressure, streamlines and thermography can be viewed separately. [Developer's tool guide](https://dan-ball.jp/en/m/dustviewer/) | Place two fans at different powers, release smoke between them and use the Air overlay to see where it goes. |
| Falling Matter on iOS | Each pixel has a temperature. Metal and wood transfer heat at different rates, and the thermal camera reveals the difference. [Developer's App Store description](https://apps.apple.com/pl/app/falling-matter/id6816210370) | Place metal and cork near a heat source. Compare the far ends with Probe or the Heat overlay. |
| SmellyMoo’s sand:box on Android | The developer describes more than 85 materials and drawing structures that exploit their interactions. [Google Play listing](https://play.google.com/store/apps/details?id=smellymoo.sand) | Keep the six most-used materials within reach. Group the full catalog by experiment and give each entry a reaction to try. |
| Sandboxels on the web | Its reaction tables connect water with salt, sand and carbon dioxide. Seltzer has distinct hot and cold products. [Water reactions](https://sandboxels.wiki.gg/wiki/Water) · [Seltzer](https://sandboxels.wiki.gg/wiki/Seltzer) | Give carbonated water a finite dissolved-gas supply. Vent or shake the chamber, then use Probe to compare the remaining bubbles and local pressure. |

## User Stories

1. As a player, I want to open a comparison tunnel or choose a blank portrait world and start drawing, so that I can play on my first launch.
2. As a player, I want to change materials and brush sizes within thumb reach, so that I can pour a broad stream or draw a narrow channel.
3. As a player, I want a fast swipe to leave a continuous stroke, so that gaps in touch sampling do not spoil my drawings.
4. As a player, I want to erase a small area without resetting the world, so that I can repair a chamber during an experiment.
5. As a player, I want to pause and keep drawing, so that I can assemble an experiment before anything moves.
6. As a player, I want to advance the paused world by one tick, so that I can inspect the order of events.
7. As a player, I want sand to fall and pile, water to spread, and smoke to rise, so that each material gives me something different to explore.
8. As a player, I want water touching sand to form wet sand, so that I can discover a reaction and see its effect on movement.
9. As a player, I want walls that seal a chamber, so that I can build two regions with different pressures.
10. As a player, I want a fan I can point in a chosen direction, so that I can steer smoke along a passage.
11. As a player, I want separate pressure and suction tools, so that I can push air into a chamber or draw it out.
12. As a player, I want to open a sealed wall, so that I can watch air and smoke respond to the opening.
13. As a player, I want a pressure overlay with a readable legend, so that I can tell high pressure, low pressure, and equilibrium apart.
14. As a creator, I want to give a new material a name and color on my phone, so that I can find it again in the palette.
15. As a creator, I want to choose how my material moves and how dense it is, so that I can experiment with settling, rising, and displacement.
16. As a creator, I want to define what happens when two materials touch, so that I can design an interaction without writing code.
17. As a creator, I want the editor to identify a conflicting or incomplete rule, so that I can fix it without losing my previous working definition.
18. As a creator, I want existing grains to use my edits, so that I can see the effect in the scene I already built.
19. As a returning player, I want my materials, devices, and world restored together, so that a saved experiment remains playable.
20. As a returning player, I want a restored experiment to wait for me, so that I can inspect it before it advances.
21. As a developer, I want to reproduce a world from a seed, inputs, and tick count, so that I can investigate simulation changes on Windows.
22. As a developer, I want to exercise the real touch interface and measure simulation speed on the iPhone, so that the release decision reflects how the game actually plays.

## Implementation Decisions

### Runtime and controls

- Use Expo, React Native, and TypeScript. React Native owns the toolbar, material palette, and editor. Draw the 160 × 240 portrait world as one nearest-neighbor pixel image on a Skia canvas. Translate touches into simulation coordinates after accounting for scaling and layout. Keep the pixel buffer and simulation arrays outside React component state. Expo Go includes the Skia and SQLite libraries required by this design. [Expo Skia](https://docs.expo.dev/versions/latest/sdk/skia/) · [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- Run the simulation at 30 fixed ticks per second. Screen refresh and touch event frequency must not change the physics. Interpolate between touch samples, clip strokes at the world boundary, and keep toolbar touches out of the canvas. Bound catch-up work after a stall. Returning from the background resumes from the saved tick without simulating the elapsed absence.
- On first launch show a resettable comparison tunnel with sand selected and a blank canvas option. Reset restores the seed and scene. Pause freezes materials and air together. Drawing while paused updates the scene immediately. Step advances the entire world exactly once and leaves it paused. App controls expose accessible names, selection state, and stable identifiers for device automation.

### Materials and reactions

The inventory contains 56 built-ins. On a new world, the six dock keys start with Clay Dust, Baking Soda, Vinegar, Copper, Wax and Flame. A seventh fixed key opens and closes the inventory. Opening inventory pauses the world and lifts the whole cartridge, including its shell, glass and all seven keys, into its pinned header. The cartridge seats in the receiving slot as the inventory closes. Inspecting a card leaves the equipped brush alone. **Use** equips the material, and **Assign** or a hold binds it to the first empty key. If the row is full, select a replacement or cancel. Closing the inventory restores the prior playback state.

| Group | Observable experiments |
| --- | --- |
| Weather | Slush, fog and frost change phase. Salt separates from brine on evaporation. Cool pressurized water absorbs available CO₂. Venting or agitation releases dissolved gas. Dry ice supplies finite CO₂, foam traps free gas, and a sponge stores and releases water. |
| Chemistry | Vinegar and baking soda produce a cooling solution and CO₂. Concentrated sodium acetate crystallizes and warms. Plaster sets into warm gypsum. Wet clay dries and rewets until firing makes permanent brick. |
| Engineering | Copper conducts heat. Tin and copper melt and solidify at different temperatures. Exposed wet iron rusts faster in brine. Wax plugs can melt and set again. Oil and cork float on water. |
| Garden | Soil holds water as mud. Moisture feeds germination and travels through roots and stems. Leaves transpire, reeds grow near water, and damp litter decomposes into compost. |

World formats V3 and V4 store 16-bit material IDs. V4 also saves each air tile’s thermal expansion so that a warming chamber resumes at the same point. Versions 1–3 load with their recorded temperature and pressure. Original materials occupy IDs 1–16, and world-local custom materials retain IDs 17–255, including legacy custom names such as Snow. New built-ins occupy IDs 257–296. ID 256 is reserved. Earlier worlds without saved bindings migrate with the classic Sand, Water, Gravel, Smoke, Wood and Flame keys, full thermal power and brush mode.

| Material | Behavior the player should see |
| --- | --- |
| Sand | Falls into open space, slides diagonally when blocked, and forms a pile. |
| Water | Falls, spreads sideways across a floor, and collects in low areas. |
| Smoke | Rises in still air and follows an imposed current around obstacles. |
| Stone | Stays where painted and blocks material movement at single-cell resolution. |
| Gravel | Heavy loose grains roll at higher wind speeds than sand. |
| Wood and flame | A drifting flame can ignite wood. Burning wood supplies more flame and smoke. |
| Wet sand | Forms when sand touches water. It still falls but spreads less readily than dry sand. |

Store material occupancy in typed arrays keyed by stable material IDs. The movement families available to creators are powder, liquid, gas, and fixed solid. Relative density controls which mobile material can displace another. Equal density alone never triggers a swap. Wind carries smoke and flame readily, shifts exposed sand, and rolls gravel at higher speeds. Packed grains divert air and remain slightly permeable. Stone supports detailed material structures. The separate **Wall** tool builds airtight partitions at air-grid resolution.

Resolve contact reactions against orthogonally adjacent cells. A rule identifies an unordered pair of input materials and one output for each input position. Each output can keep the original, replace it with a named material, or leave the cell empty. The starter rule turns the sand grain into wet sand and consumes its water neighbor. Resolve competing contacts in deterministic order, using the world's seeded generator for tie-breaking where appropriate. A cell can participate in at most one reaction per tick.

### Wind and pressure

Overlay a 40 × 60 air grid on the material world. Each air cell covers 4 × 4 material cells. Store relative pressure at cell centers and horizontal and vertical velocities on the connecting faces. Start at neutral pressure with zero velocity. Use a bounded, damped update in which pressure differences accelerate air across open faces and net flow changes local pressure. This is a gameplay approximation for pressure buildup, leakage, and transport. [Grid-based fluid simulation background](https://www.cs.ubc.ca/~rbridson/fluidsimulation/)

| Tool | Placement and effect |
| --- | --- |
| Wall | Snaps to the air grid. A wall tile blocks materials throughout its footprint and seals its air faces. Show the snapped footprint before placement. |
| Fan | Snaps to an open air tile, captures the current 0–100% strength at placement and applies momentum in one of four directions. Tap a placed fan with the Fan tool to turn it a quarter turn. |
| Material source | A repeat tap on an equipped mobile material switches between brush and source. Place a source on an empty tile. Its stored material and radius determine what exits open neighboring cells per tick. |
| Heat and Cool | Set the brush radius and 0–100% thermal power. Hold to apply the brush during play, or repeat-tap the tool and place a source with fixed radius and power. |
| Wind brush | A directional stroke adds a temporary gust that decays. |
| Pressure source | Adds air locally each tick, raising pressure in a sealed chamber. |
| Suction source | Removes air locally each tick, lowering pressure in a sealed chamber. |
| Eraser | Removes materials under the brush and removes a wall or device at the touched tile. Removing a wall reopens its faces on the next tick. |

The world edges are sealed. Placing a wall clears its footprint of loose materials and devices and cancels flow through its faces. Removing it leaves empty material space. Allow one air device per open air tile. A device occupies the air layer and lets material pass. Bound pressure and velocity so a forgotten source remains stable. The overlay shows signed pressure with a neutral midpoint and a legend. Toggling it changes only the display.

Thermal brushes and sources add or remove heat. In air connected by open faces to a board edge, thermal edits and flame leave bulk airflow and pressure alone. Smoke and flame retain their intrinsic rise, and existing wind still carries heat and particles. In a pocket enclosed by Wall tiles, the solver gradually couples air temperature to pressure and local temperature gradients to buoyancy. Opening a wall allows the existing pressure difference to vent. Pneumatic devices, gusts and gas-producing reactions work throughout the board.

### On-phone editor and persistence

Custom contacts can have inclusive minimum and maximum temperatures and signed local pressure limits. Optional heat exchange applies once when a contact transforms materials. Omitted conditions preserve the original contact-only behavior. Checkpoints include the world-local catalog, hotbar, source mode, brush and thermal settings, device payloads, per-fan strengths and particle inventories.

Create and edit custom definitions in the app. The form includes display name, color, movement family, relative density on a 1–100 scale, and contact reactions. Reject blank or duplicate display names, invalid colors, non-finite or out-of-range densities, missing material references, and duplicate or reversed rules for the same pair. Explain the error beside the relevant field and preserve the draft. Commit a valid edit as one change. A new material appears in the palette immediately. Renaming or recoloring a definition preserves its ID, its reactions, and the cells already using it.

Use one local world slot in Expo SQLite. Capture a coherent snapshot at a tick boundary, or after a complete edit while paused. Persist the format version, world dimensions, material cells, catalog and reaction rules, walls and devices, air pressure and velocities, tick counter, and random-generator state. Save explicitly, periodically when dirty, and on backgrounding when the platform allows. Commit atomically and prevent an older in-flight save from replacing a newer one. An interrupted write must leave the previous committed world loadable. If a version cannot be read, preserve the saved data and show an explanation.

Reopen the last committed world paused. Gameplay and saves operate locally once the project is loaded. A fresh development launch uses Expo Go and a reachable development server with a compatible SDK. A standalone installation that can cold-launch independently is a later deliverable. [Expo device development workflow](https://docs.expo.dev/get-started/start-developing/)

## Testing Decisions

**World behavior on Windows.** Exercise the public simulation operations for creating a world, applying player actions, advancing ticks, and saving and restoring state. Use small seeded scenes and assert observable material positions, counts, pressure differences, or flow direction. Keep numerical tolerances explicit for air behavior. The new project has no existing test suite to preserve.

| Experiment | Acceptance condition |
| --- | --- |
| Movement and contact | Sand settles above a floor, water spreads, and smoke rises in still air. An isolated sand–water pair yields one wet-sand cell and one empty cell. |
| Directed wind | In a walled passage, smoke travels farther downwind than in the same seeded scene with the fan off. Reversing the fan reverses the horizontal displacement. |
| Seal and opening | A source pressurizes one of two sealed chambers while the other stays at baseline. Switch the source off and open one wall tile. Flow initially points toward the low-pressure chamber and the pressure difference falls. |
| Suction and stability | Suction causes a negative local pressure and inward flow. A long-running source in a sealed chamber leaves finite, bounded pressure and velocity. |
| Pause and overlay | Multiple rendered frames while paused leave both grids unchanged. A brush stroke appears immediately. Step advances one tick. Runs with the overlay on and off produce identical world state. |
| Editor integrity | A custom material can be painted and can react. Renaming it preserves existing cells and rules. A reversed duplicate rule is rejected and the prior catalog still works. |
| Restore and replay | A saved world and its restored copy produce the same next 100 ticks from identical inputs on the same runtime. Interrupt a save and reopen the previous complete snapshot. |

**Physical iPhone.** Open the project in Expo Go from Windows. Use Appium with XCUITest for repeatable touch sequences. Target the installed Expo Go host, locate tools by accessibility ID, and derive drawing coordinates from the visible canvas bounds. Verify painting, stepping, rotating a fan, opening a chamber, creating a material, and reopening a save. On Windows, the Appium XCUITest route requires a compatible device and a signed, reachable WebDriverAgent. Record the actual phone, iOS version, and automation route used. Routine checks run locally without an iOS simulator or an Xcode runner job. [Appium real-device support on non-macOS hosts](https://appium.github.io/appium-xcuitest-driver/12.22/guides/non-macos-hosts/)

**Performance acceptance.** On a physical iPhone, save a 160 × 240 world with at least 19,200 occupied cells, moving sand and water, smoke, a fan, a pressure device and active sources. From that checkpoint, draw continuously for 60 seconds in Normal view. Reload the same checkpoint and repeat with Pressure, Air and Heat enabled. For each run, record device, iOS and build, starting occupancy, start and end tick, elapsed time, dropped or delayed frames, simulation time, and pixel upload/render time separately. Each run must complete at least 1,770 ticks in 60 seconds. Both builds tested on 21 November 2026 missed that target in both views.

The isolated Expo Go 58.0.5 fixture restored the same half-filled world in memory for each run on iPhone18,2, iOS 27.2.1. It ran the native Board with a minified, non-development bundle. Appium dragged a water brush across the canvas. The timing window started at tick zero.

| Build and view | Elapsed | End tick | Ticks with touch down | Frame intervals over 34 ms / observed | Longest interval | Simulation per tick | Raster per image | Skia image submission per image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial, Normal | 60.435 s | 433 | 417 | 145 / 145 | 536 ms | 131.58 ms | 22.81 ms | 0.04 ms |
| Initial, Pressure + Air + Heat | 60.120 s | 410 | 396 | 137 / 137 | 555 ms | 133.93 ms | 36.77 ms | 0.04 ms |
| Optimized, Normal | 60.064 s | 1,474 | 1,422 | 413 / 800 | 157 ms | 38.64 ms | 2.22 ms | 0.02 ms |
| Optimized, Pressure + Air + Heat | 60.113 s | 1,393 | 1,346 | 501 / 570 | 170 ms | 41.02 ms | 4.61 ms | 0.02 ms |

Frame intervals came from the Board's animation callbacks. Raster and Skia timings cover CPU-side pixel generation and image submission. GPU completion time was unmeasured.

On 21 November 2026, Appium exercised the inventory in Expo Go 58.0.5 on a physical iPhone18,2 running iOS 27.2.1. The six docked and expanded keys were 44 points high. The device exposed the full-row replacement prompt, cancellation, unbound Slush brush and source modes, and the Probe temperature, pressure and airflow readings. The world stayed at tick zero throughout these checks.

## Out of Scope

The expanded solver couples heat changes to bounded pressure, convection under the current gravity, and pressure-dependent water and steam transitions. Detailed combustion chemistry, a full Sandboxels catalog or mod loader, arbitrary user scripts, multiple player save slots, cloud sharing and multiplayer remain outside scope. The manual Xcode workflow packages an unsigned iPhone IPA. LiveContainer launch verification, TestFlight and App Store distribution are separate.

## Further Notes

Expo was selected because Expo Go can run the touch interface, Skia renderer, and TypeScript simulation directly on the iPhone during development from Windows. Flutter is also suited to a custom canvas, but choosing it would give up the requested Expo Go workflow. The simulation has no dependency on an Apple UI framework.

Build the PC comparison tunnel first. Start Expo Web on Windows using the shared TypeScript simulation and Skia renderer. Compare smoke, flame, sand, and gravel under adjustable wind. Verify pile-induced plume deflection, gust decay, pressure release, and directional ignition with seeded experiments. Exercise the canvas, tools, fan knob, stepping, and reset in a real browser. Then expand the material catalog, editor and saves and validate the full game on the physical iPhone. [PC milestone](https://github.com/jeemzy/siftwake/issues/2) · [iPhone game](https://github.com/jeemzy/siftwake/issues/1)
