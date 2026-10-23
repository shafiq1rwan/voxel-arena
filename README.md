# Voxel Survival Arena

A first-person voxel arena survival shooter for desktop and mobile browsers, targeting Poki.
It's built with Babylon.js, TypeScript (strict mode) and Vite.

> *Every arena is different. Every weapon is unique. Every survival run creates a new challenge.*

**Status: Milestone 1 (playable FPS prototype) is complete.** The roadmap is at the bottom.

## Quick start

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm 10 peer-resolution bug)
npm run dev          # dev server at http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ at http://localhost:4173
npm test             # unit tests (arena generation, validation, nav, waves, weapons)
```

Requirements: Node 18+ (tested on Node 23) and a WebGL 2 browser.
The production build in `dist/` is fully static and uses relative paths. You can upload it as-is
or open it from any folder or iframe, and it doesn't need a server or a database.

## Controls (desktop)

| Input | Action |
| --- | --- |
| WASD / arrows | Move (physical key positions, so AZERTY also works) |
| Mouse | Look (pointer lock, raw input where supported) |
| Left click | Fire |
| Right click | Aim down sights (zoom, tighter spread, reduced recoil) |
| R | Reload |
| Space | Jump (coyote time and jump buffering) |
| Shift | Sprint |
| Esc / P | Pause |
| F3 | Debug overlay: seed, generation info, flow-field heat map and spawn points on the minimap |

## What's playable now (Milestone 1)

- **Seeded procedural arenas.** Each run builds a 40 × 40 m arena from a seed:
  - Four themes: Desert Ruins, Industrial, Frozen Fortress and Neon City.
  - Symmetric or free layouts with walls, broken walls, cover, crate stacks, pillars, and raised platforms with staircases.
  - Glowing windows and a backdrop skyline.
  - Generation is validated: every floor cell is reachable, the centre is open, there's a perimeter loop plus axis corridors, and spawns are on open ground away from the player. If validation fails, the generator retries with a deterministic derived seed.
- **FPS controller.** Movement is acceleration-based at 5 m/s walking and 7.5 m/s sprinting. It has gravity, jumping, auto step-up for stairs, ledge mantling, head bob, recoil, trauma camera shake, landing dip and ADS zoom.
- **Assault rifle**, assembled from components (receiver, barrel, magazine, stock, sight):
  - Stats: 15 damage, 6 shots/s, 30-round magazine, 1.6 s reload.
  - Hitscan with spread and bloom, headshots and crits, and damage falloff.
  - Feedback: tracers, muzzle flash and light, impact sparks, viewmodel recoil, sway and bob, and a reload animation that drops the magazine.
- **Chaser enemy** with procedural looks (palette, proportions, horns, armour, backpack) and a finite-state-machine AI:
  - States: SPAWNING → CHASE → ATTACK (telegraphed wind-up) → RECOVER, plus STUNNED on headshots.
  - Navigation uses a shared flow field, so pathfinding cost doesn't grow with enemy count. Enemies also keep their distance from each other and take knockback.
  - Kills burst into voxel debris.
- **Waves.** Wave state machine: `PREPARE → SPAWNING → COMBAT → REWARD → NEXT_WAVE`.
  - The threat budget uses `6 + 3w + floor(0.4w²)` and the concurrency cap uses `min(24, 5 + 2w)`.
  - Enemies spawn in batches at validated points out of the player's sight.
  - Waves continue endlessly in Milestone 1.
- **Pickups.** Health and ammo drop from enemies, with more drops when you're running low. Map pickups also appear at validated points after each wave.
- **Health, death and restart.** Contact damage gives brief invulnerability, and there's a death camera. The results screen shows wave, time, kills, score, accuracy, headshots, weapon and arena seed, plus a "next goal" prompt.
- **HUD** laid out like the art direction:
  - Rotating minimap with enemy and pickup blips.
  - Wave tracker, kills and score, and a pause button.
  - A dynamic crosshair whose gap matches the real spread cone.
  - Hitmarkers (normal, crit and kill), damage-direction arcs and a low-health vignette.
  - Health bar, plus a weapon icon drawn from the procedural parts, and ammo and reload indicators.
- **Menus.**
  - Main menu over a live, orbiting procedural arena, with a custom seed field and personal records.
  - Pause menu: resume, controls, settings, quit.
  - Settings (applied live and saved): sensitivity, invert Y, FOV, quality, volume, FPS counter.
- **Procedural audio.** All sound effects are synthesised with WebAudio, so there are no audio files to download.
- **Save system.** Saves are versioned and sanitised field by field. If a save is corrupted or `localStorage` is blocked, the game keeps running.
- **Poki adapter**, built against the current SDK docs, with a mock adapter for local development (see below).
- **Analytics hooks** cover game_loaded, game_started, first_enemy_killed, wave_started, wave_completed, player_died, run_completed and retry_clicked. They record no personal data.

## Architecture

```text
src/
  config.ts                 central gameplay tuning + quality presets
  main.ts                   boot, WebGL check, loading screen
  core/        Game (composition root + app state machine), GameState, SceneManager,
               EventBus (typed), SeededRandom, Analytics, MathUtil
  player/      PlayerController, InputManager, InputState (device-agnostic), DesktopInput
  procedural/  ArenaGenerator, ArenaValidator, ArenaTypes, Themes, WeaponGenerator, EnemyGenerator
  world/       VoxelWorld (grid collision + DDA raycasts), NavGrid (flow field), ArenaRenderer
  render/      VoxelMeshBuilder (merged coloured boxes), Materials (shared cache), Effects (pooled particles)
  combat/      WeaponSystem, WeaponViewModel, WeaponTypes, HitDetection, DamageSystem
  enemies/     Enemy, EnemyRig (instanced), EnemyAI (FSM), EnemyPool, EnemySpawner, EnemyTypes
  waves/       WaveManager, ThreatBudget
  pickups/     PickupSystem
  progression/ SaveManager, Skins
  platform/    PlatformAdapter, PokiAdapter, MockPokiAdapter, createPlatform
  ui/          HUD, Minimap, MainMenu, PauseMenu, SettingsPanel, ResultsScreen, PixelLogo, dom
  styles/      main.css
tests/         Vitest unit tests for the pure (Babylon-free) systems
```

Key design decisions:

- **Procedural data is separate from rendering.** `procedural/` returns plain data, with no Babylon objects. That makes generation deterministic, unit-testable and reproducible from a seed.
- **Custom grid physics.** Collision and hit detection query the column heightmap directly: axis-separated sweeps plus 2D DDA raycasts. This is cheaper and more predictable than generic mesh collision.
- **Draw calls stay low.** We measured about 25 WebGL draw calls per frame in combat, including glow passes.
  - Terrain is one merged, vertex-coloured mesh with baked voxel ambient occlusion.
  - Every glow colour gets its own merged mesh.
  - All enemy body parts are instances of a single cube, tinted per instance.
  - Particles and tracers are thin instances.
- **No allocations in hot loops.** Enemies, particles, tracers, pickups and hit results are pooled.
- **Systems communicate over a typed `EventBus`.** Analytics, the HUD, waves and pickups subscribe to events and never reach into each other.

## Testing

- `npm test`: Vitest covers the following.
  - Same seed gives the same arena, and different seeds give different arenas.
  - 300 seeds pass validation: no unreachable floor, all platforms reachable, and spawns valid and far from the player.
  - The flow field reaches every spawn.
  - Raycasts and collision behave correctly.
  - Threat-budget formulas and weapon base stats match the spec.
- **URL flags**
  - `?seed=CODE` prefills the arena seed.
  - `?debug` turns on the debug overlay (F3 toggles it too).
  - `?mock` forces the mock SDK, and `?mockads` makes it simulate visible ad breaks.
  - `?poki` forces the real SDK.
  - `?test&autostart` is for automated browser tests: it skips pointer lock and starts a run immediately.
- **Browser smoke test.** Milestone 1 was verified in headless Microsoft Edge with this sequence:
  1. Start a run, move and fire.
  2. Get hits, headshots and kills, then reload.
  3. Clear wave 1 and advance to wave 2.
  4. Die and see the results screen.
  5. Pause, resume and quit.
  6. Check that settings persist across a reload and that the same seed gives an identical arena.
  7. Check that a corrupted save and blocked storage don't break the game.

  No console errors appeared during the run.

## Poki preparation

- `PokiAdapter` wraps the official HTML5 SDK (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js`):
  - Calls `init()` and continues even if init fails (for example, because of an ad blocker).
  - Calls `gameLoadingFinished()` once.
  - De-duplicates `gameplayStart()` and `gameplayStop()`.
  - Calls `commercialBreak()` between runs, never during combat and never before the first run of a session.
  - Mutes audio and disables input while an ad plays.
  - `rewardedBreak()` grants the reward only when it resolves `true`. It isn't used until opt-in rewards arrive.
- The SDK script loads only on Poki hosts (or with `?poki`). Local development uses `MockPokiAdapter`, which logs lifecycle calls and flags duplicate `gameplayStart` calls.
- To test with the Poki Inspector:
  1. Run `npm run build`.
  2. Zip the contents of `dist/`.
  3. Upload the zip at <https://inspector.poki.dev>.
  4. Check the lifecycle events and ad flow in the Inspector panel.

## Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| 1. Playable FPS prototype | Arena, controller, rifle, chaser, combat, health, death, restart | ✅ Done |
| 2. Wave survival | Shooter archetype (projectiles), upgrade selection screen between waves, wave composition table | Next |
| 3. Procedural content | Component pools and seeded weapon assembly (heavy/rapid/long barrels; energy/explosive/freeze modules), more enemy variation, explosive props, hazards | Planned |
| 4. Roguelite progression | 10 waves + boss, full upgrade pool + synergies/mutations, achievements, skin gallery, Scrap unlocks | Planned |
| 5. UI & mobile | Touch controls (joystick, look region, buttons), mobile HUD, loadout screen, accessibility | Planned |
| 6. Poki preparation | Inspector verification, rewarded-break features, asset/bundle optimisation, device testing | Planned |

The architecture is already set up for these milestones:

- `InputProvider` lets touch controls plug in as another input source.
- `WaveManager.onRewardPhase` is the hook for the upgrade screen.
- `ArchetypeDef` and `EnemyState` already include the extra states.
- Skins are palette-slot mappings that never touch stats.
- `PlatformAdapter` already supports rewarded breaks.
