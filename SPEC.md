# Siftwake

An ad-free falling-sand game for iPhone. Draw a tunnel, release smoke, aim a fan down the passage, and cut an opening to see how the flow changes.

## Problem Statement

I want a falling-sand sandbox I can play on my iPhone without ads or a paid unlock. I want to invent a material on the phone and immediately see how it behaves alongside sand, water, and smoke. Air should be part of the experiment. A wall should hold a pressure difference, and opening it should change where smoke goes.

I develop on Windows and have a physical iPhone. Everyday changes to materials, physics, and controls should be playable on that phone without spending a macOS runner build on each iteration.

## Solution

Build Siftwake as an Expo app with a touch canvas, a fixed-step simulation, and a local material editor. Launch it in Expo Go from a Windows development server. The player can paint, pause, advance one tick, build chambers, place air devices, and save a world together with the materials it uses. The play screen has no advertising, purchases, or game-account prompt.

Sandboxels establishes that this kind of game can run client-side. Its public source combines JavaScript material behavior with browser rendering and controls. Use it as a reference for how materials interact. Use established methods and evaluate suitable source code for license compatibility and attribution before integrating it. Tune behavior against the agreed experiments. Its rendering surface is native Skia. [Sandboxels source](https://github.com/R74nCom/sandboxels/blob/main/index.html) · [Upstream license](https://github.com/R74nCom/sandboxels/blob/main/license.txt)

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
| Fan | Snaps to an open air tile and applies momentum in one of four cardinal directions. With the Fan tool selected, tap an existing fan to turn it a quarter turn. Adjust fan strength continuously from 0 to 100%. |
| Wind brush | A directional stroke adds a temporary gust that decays. |
| Pressure source | Adds air locally each tick, raising pressure in a sealed chamber. |
| Suction source | Removes air locally each tick, lowering pressure in a sealed chamber. |
| Eraser | Removes materials under the brush and removes a wall or device at the touched tile. Removing a wall reopens its faces on the next tick. |

The world edges are sealed. Placing a wall clears its footprint of loose materials and devices and cancels flow through its faces. Removing it leaves empty material space. Allow one air device per open air tile. A device occupies the air layer and lets material pass. Bound pressure and velocity so a forgotten source remains stable. The overlay shows signed pressure with a neutral midpoint and a legend. Toggling it changes only the display.

### On-phone editor and persistence

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

**Physical iPhone.** Open the project in Expo Go from Windows. Use MobAI for visual inspection and Appium for repeatable touch sequences. Target the installed Expo Go host, locate tools by accessibility ID, and derive drawing coordinates from the visible canvas bounds. Verify painting, stepping, rotating a fan, opening a chamber, creating a material, and reopening a save. On Windows, the Appium XCUITest route requires a compatible device and a signed, reachable WebDriverAgent. Record the actual phone, iOS version, and automation route used. Routine checks run locally without an iOS simulator or an Xcode runner job. [Appium real-device support on non-macOS hosts](https://appium.github.io/appium-xcuitest-driver/12.22/guides/non-macos-hosts/)

**Performance acceptance.** On the physical iPhone, run the full-size world for 60 seconds with at least half the material cells occupied, moving sand and water, smoke, a fan, and a pressure device. Target 30 simulation ticks per second and accept at least 1,770 completed ticks in that minute while the player can draw continuously. Record completed ticks, dropped or delayed frames, simulation time, and pixel upload/render time separately. Recheck the same scene with the overlay enabled. This is a proposed acceptance threshold, pending a device measurement.

## Out of Scope

Version one excludes temperature transport, detailed combustion chemistry, heat-driven convection, a full Sandboxels catalog or mod loader, arbitrary user scripts, multiple save slots, cloud sharing, and multiplayer. Packaging a standalone IPA, LiveContainer compatibility, TestFlight, and App Store distribution are separate release work. A simulator matrix and macOS builds on every change are outside the first-version test workflow.

## Further Notes

Expo was selected because Expo Go can run the touch interface, Skia renderer, and TypeScript simulation directly on the iPhone during development from Windows. Flutter is also suited to a custom canvas, but choosing it would give up the requested Expo Go workflow. The simulation has no dependency on an Apple UI framework.

Build the PC comparison tunnel first. Start Expo Web on Windows using the shared TypeScript simulation and Skia renderer. Compare smoke, flame, sand, and gravel under adjustable wind. Verify pile-induced plume deflection, gust decay, pressure release, and directional ignition with seeded experiments. Exercise the canvas, tools, fan knob, stepping, and reset in a real browser. Then expand the material catalog, editor and saves and validate the full game on the physical iPhone. [PC milestone](https://github.com/jeemzy/siftwake/issues/2) · [iPhone game](https://github.com/jeemzy/siftwake/issues/1)
