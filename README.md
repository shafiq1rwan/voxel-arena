# Voxel Survival Arena

A first-person voxel arena survival shooter for desktop and mobile browsers, targeting Poki.
It's built with Babylon.js, TypeScript (strict mode) and Vite.

> *Every arena is different. Every weapon is unique. Every survival run creates a new challenge.*

**Status: Milestones 1–6 are implemented.** A run is 10 waves ending in a boss fight, with procedural weapons, elites, upgrade synergies, Scrap unlocks, achievements, skins, touch controls and a rewarded revive. The roadmap and remaining work are at the bottom.

## Quick start

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm 10 peer-resolution bug)
npm run dev          # dev server at http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ at http://localhost:4173
npm test             # unit tests (arenas, nav, waves, weapons, progression, saves)
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
| Q | Dash (after taking Dash Charge, or from the start with the Starting Dash unlock) |
| G | Frag grenade (unlock) |
| F | Take the weapon from a nearby crate |
| 1–3 / mouse wheel | Switch weapon (up to 3 carried) · pick an upgrade card |
| Esc / P | Pause |
| F3 | Debug overlay: seed, generation info, flow-field heat map and spawn points on the minimap |

## Controls (touch)

Touch controls turn on automatically on touch devices (`?touch` forces them on desktop).

- **Left thumb:** floating joystick. Push it fully forward to sprint.
- **Right side:** drag to look. FIRE also aims while you hold and drag it.
- **Buttons:** FIRE, AIM, JUMP and R (reload). DASH, NADE, SWAP and TAKE appear once they're usable.
- **Aim assist:** gentle and optional, touch only. A small cone slows the look speed over a target and pulls slightly toward it.
- **Settings:** touch sensitivity, button size, auto-fire and aim assist.

## Milestone 1: playable FPS prototype

- **Seeded procedural arenas.** Each run builds a 40 × 40 m arena from a seed:
  - Four fortress themes, picked per seed (`?theme=ruins|industrial|frozen|neon` forces one): Emberwatch Ruins (amber lanterns, moss, clouds), Foundry Citadel (sodium lamps, shutter doors, pipes, rust, smokestacks), Frostspire Keep (frost braziers, snow caps, icicles, ice spires) and Neon Citadel (neon-outlined bays, holo signs, glowing edge trims, antenna towers).
  - All four share one fortress skeleton (`src/procedural/FortressDecor.ts`): wall bays, a cornice with merlons and a gatehouse on every wall. Each theme then dresses it with its own kit. Decoration never changes the collision heightmap.
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
  - Waves follow a composition table: waves 1–2 are chasers only (wave 2 spawns faster), wave 3 introduces shooters, wave 4 mixes them, and wave 5 onward escalates the mix and spawn rate. The full 10-wave table is described under Milestone 4.
  - The first spawns of every wave are melee, so each wave opens readably; shooters are then spread through the rest.
  - Clearing a wave grants one magazine of reserve ammo.
- **Shooter enemy** (added in Milestone 2): a slimmer blue robot with a cyan visor and an arm-mounted blaster.
  - Stats: 45 HP and 7-damage bolts about every 2.5 s, with a threat cost of 2.
  - AI: SEEK → STRAFE (circles inside a 7–14 m band, flips direction when blocked) → ATTACK (0.6 s telegraph: plants feet, raises the blaster, muzzle glow swells, rising whine) → RECOVER. Losing sight cancels the shot; headshots stagger it and reset its aim.
  - Bolts are pooled projectiles at 15 m/s that lead your movement only partly, so strafing dodges them. They're swept against walls and the player's capsule every frame, so they never tunnel.
  - Shooters show as cyan blips on the minimap.
- **Roguelite upgrades** (added in Milestone 2): after every wave you pick 1 of 3 cards (click, or press 1/2/3). Combat pauses, the mouse is released, and it's re-captured by the pick itself.
  - All 12 upgrades from the brief: Heavy Rounds, Rapid Fire, Critical Precision, Piercing Shots, Expanded Magazine, Swift Reload, Quick Feet, Dash Charge (Q, with cooldown and brief invulnerability), Reinforced Armor, Regeneration, Last Stand (one lethal hit per wave) and Explosive Kills (chainable).
  - Offers are seeded per run, weighted by rarity (common/rare/epic), varied by category, and never include a maxed upgrade. Stacks have caps, and the combined weapon stats are capped too.
  - The bottom-centre HUD shows the dash slot (Q and cooldown) plus a chip for every owned upgrade with its stack count. The results screen lists the run's build.
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

## Milestone 3: procedural content

- **Seeded weapon assembly** (`WeaponGenerator.ts`) for three families: assault rifle, shotgun and SMG.
  - Each weapon rolls a barrel (standard, Marksman, heavy, rapid), magazine (standard, extended, drum, Quickload), stock (standard, steady, light) and sight (iron, scope, holo).
  - Compatibility rules apply: a shotgun can't take a drum magazine or a scope, and the scope is rifle-only.
  - Each part shifts the stats, and the totals are capped (fire rate ≤ 16/s, reload ≥ 0.6 s, magazine ≤ 90).
  - The name is derived from the parts, for example "Arc Rapid Shotgun". A rarity tier comes from how far the roll is from the baseline.
- **Weapon modules**, one per weapon at most:
  - **Energy (Arc):** 22% chance to chain lightning to 2 nearby enemies.
  - **Explosive (Volatile):** kills detonate.
  - **Freeze (Cryo):** slows the target by 45% for 1.5 s.
  - Modules glow on the viewmodel and tint the HUD icon. Explosive and freeze must be unlocked before they can roll.
- **Same seed, same weapon.** The loadout screen shows the rolled weapon with stat bars and a part list, and REROLL draws a new seed.
- **Weapon crates.** Crates spawn after waves 2, 4, 6 and 8, and elites drop them. Walk up and press F (or TAKE) to pick one up.
  - You carry up to 3 weapons. Taking a 4th replaces the one in your hand.
  - Your other weapons get half of every ammo pickup.
- **Hit zones.** Shots register head, body or weak-point core hits, each with its own multiplier. Tanks have armoured heads and glowing chest cores.
- **More enemy variation.** Tanks, elites and the boss each have their own palettes and silhouettes. Elites are 15% larger, gold-trimmed and crowned.

## Milestone 4: roguelite progression

- **The 10-wave run.**
  - Wave 5 brings the first elite and wave 6 brings tanks. Wave 7 is mixed with an elite, and wave 8 is faster.
  - Wave 9 has three elites, and wave 10 is the boss plus a small escort.
  - Every wave spends its threat budget exactly. Elites cost +4 on top of their archetype.
- **Tank:** 220 HP, slow, and resists knockback. Only hits to its core stagger it.
  - It telegraphs a ground slam with a red ring on the floor.
- **Elites:** 2.2× health, a gold crown, 3× score, and an extra ability per archetype.
  - Berserker chasers leap at a telegraphed landing spot.
  - Shooters fire 3-bolt bursts.
  - Warden tanks slam a wider ring and regenerate.
- **Boss, the Obsidian Colossus** (2,500 HP), with a boss health bar:
  - The fight has three phases, at 66% and 33% health. Each phase change starts with a roar.
  - It fires bolt volleys of 5, 7 and then 9.
  - From phase 2 it adds a telegraphed slam at your position and summons minions.
  - Phase 3 is faster.
  - Killing it clears its minions and wins the run.
- **Endless mode** (unlock) keeps going after wave 10, with a tougher boss every 10th wave.
- **Upgrade mutations.** Certain pairs of upgrades unlock a mutation, and once you own one half, the offers favour the other.
  - **Volatile Rounds** (Rapid Fire + Explosive Kills): every 8th consecutive hit detonates.
  - **Deadeye** (Critical Precision ×2 + Piercing): crits deal more damage and pierce further.
  - **Phantom Step** (Dash + Quick Feet): dash cooldown −40%.
  - **Juggernaut** (Armor ×2 + Regeneration): 15% damage reduction.
- **Scrap.** Each run pays `5 + 3·waves + floor(kills/20) + 15 on victory`. Challenge modifiers add a bonus, and achievements pay their own rewards.
- **Armory (unlock shop).**
  - Shotgun and SMG families, Frag Grenade, Starting Dash, and the Explosive and Freeze modules.
  - The Frostspire and Neon themes.
  - Challenge modifiers: Glass Cannon (±50% damage, +40% Scrap), Swarm (+50% enemies, +50%) and Iron Man (no healing, +60%).
  - Endless mode, which is free once you become Arena Champion.
  - A new player already has the complete core game. Unlocks add variety, not power.
- **10 achievements** with progress bars and toasts. Seven of them unlock a weapon skin: Desert Camo, Crimson, Digital Blue, Molten Core, Thunderstrike, Void and Golden Survivor.
- **Skins are cosmetic only.** They're palette and pattern mappings (camo, digital, molten, thunder, void, gold) and never change stats.
- **Results screen.**
  - The run's Scrap with its breakdown, and the achievements unlocked this run.
  - Your two closest achievements and the run's build, including mutations.
  - A suggested next challenge.

## Milestone 5: UI & mobile

- **Main menu.** PLAY, UPGRADES (Armory), ACHIEVEMENTS, WEAPON SKINS, HOW TO PLAY and SETTINGS, plus your Scrap.
  - PLAY opens the **loadout**. The left side shows a slowly rotating 3D preview of the weapon. The panel on the right picks the family, weapon roll, skin, mode, challenges and arena seed.
- **Touch controls and mobile HUD** (see Controls above).
  - On phones the HUD compacts and the weapon panel collapses to the ammo count.
  - Short landscape screens get two-column menus.
  - Portrait mode shows a "rotate to landscape" hint.
- **Settings** are grouped into Mouse, Touch (shown on touch devices only), Display, Accessibility and Audio.
  - **Display:** HUD size and crosshair colour.
  - **Accessibility:** camera-shake strength, head bob, and reduced flashing (which softens the muzzle flash, explosions and lightning).
- How to Play covers every archetype, crates, mutations and Scrap, and shows touch controls on touch devices.

## Milestone 6: Poki preparation

- **Rewarded revive.** It's offered once per run when you die, with a 7-second countdown, and it's opt-in. The reward is granted only when `rewardedBreak()` resolves `true`.
  - You come back with 50% health and 2.5 s of invulnerability.
  - A shockwave knocks back nearby enemies.
  - If the ad fails, the player is told and nothing is granted.
- **Lifecycle.** `gameplayStop` is sent on death, pause, the upgrade screen, ad breaks and when a run ends. `gameplayStart` is re-sent after a revive, a resume or an upgrade pick. Both calls are de-duplicated.
- **Bundle.** Everything is bundled locally: Babylon deep imports only, Phosphor icons inlined, the font bundled, and audio synthesised. The build is about 1.25 MB (about 310 KB gzipped) and makes no runtime requests except the Poki SDK.
- **Robustness.** A stuck-enemy watchdog relocates any enemy that is out of sight and hasn't moved for 5 s, so a wave can never soft-lock. Large enemies collide with the terrain using a slimmer body, so they fit through one-cell doorways.

## Architecture

```text
src/
  config.ts                 central gameplay tuning + quality presets
  main.ts                   boot, WebGL check, loading screen
  core/        Game (composition root + app state machine), GameState, SceneManager,
               EventBus (typed), SeededRandom, Analytics, MathUtil
  player/      PlayerController, InputManager, InputState (device-agnostic), DesktopInput,
               TouchInput (joystick/look/buttons), AimAssist
  procedural/  ArenaGenerator, ArenaValidator, ArenaTypes, Themes, FortressDecor,
               WeaponGenerator, EnemyGenerator
  world/       VoxelWorld (grid collision + DDA raycasts), NavGrid (flow field), ArenaRenderer
  render/      VoxelMeshBuilder (merged coloured boxes), Materials (shared cache), Effects (pooled particles),
               Telegraphs (pooled warning rings)
  combat/      WeaponSystem (3 slots, modules, mutations), WeaponViewModel, WeaponTypes, HitDetection,
               DamageSystem (zones, explosions, chain lightning), GrenadeSystem
  enemies/     Enemy, EnemyRig (instanced), EnemyAI (FSM), EnemyPool, EnemySpawner, EnemyTypes
  waves/       WaveManager, ThreatBudget (10-wave table + endless)
  upgrades/    UpgradeManager, UpgradeTypes, SynergyManager (mutations)
  pickups/     PickupSystem, WeaponCrates
  progression/ SaveManager (v2 schema + v1 migration), Achievements, Skins, UnlockManager, ProgressionTracker
  platform/    PlatformAdapter, PokiAdapter, MockPokiAdapter, createPlatform
  ui/          HUD, Minimap, MainMenu, LoadoutScreen, MenuScreens (Armory, Achievements, Skins),
               PauseMenu, SettingsPanel, ResultsScreen, ReviveScreen, Notifier, HowToPlay, icons, dom
  styles/      main.css
tests/         Vitest unit tests for the pure (Babylon-free) systems
```

Key design decisions:

- **Procedural data is separate from rendering.** `procedural/` returns plain data, with no Babylon objects. That makes generation deterministic, unit-testable and reproducible from a seed.
- **Custom grid physics.** Collision and hit detection query the column heightmap directly: axis-separated sweeps plus 2D DDA raycasts. This is cheaper and more predictable than generic mesh collision.
- **Lighting is baked, not real-time.** Sun shadows (one ray per vertex toward the sun through the voxel grid) and lantern light pools are written into the arena's vertex colours when the arena is built. There's no shadow map, and the shader uses three lights (sky, sun, muzzle flash). Under a weak-GPU simulation in a Poki-sized frame, this ran about 58% faster than the previous shadow-map version.
- **Adaptive resolution.** When frames take longer than about 20 ms, the game renders fewer pixels, down to 60% per axis. After a few seconds of comfortable 60 fps it scales back up. This is what keeps weak integrated GPUs and phones playable.
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
  - Weapon generation is deterministic, varied, follows the compatibility rules and respects the stat caps.
  - Locked modules never roll, and skins carry no stat fields.
  - The 10-wave table matches the spec, and every wave spends its budget exactly.
  - Achievements unlock once, unlocks spend Scrap correctly, and the Scrap formula matches the spec.
  - Version-1 saves migrate, and corrupted saves fall back safely.
  - Mutations activate when their upgrades are owned.
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
- **Milestones 3–6 browser checks** (headless Edge, scripted):
  - A full run from wave 5 to victory: elite leaps, tank slams with warning rings, crate pickups and weapon switching, grenades, both boss phase changes, the victory results and achievement toasts.
  - Revive: an ad shown through the mock, back at 50% health, then a second death going to results.
  - Endless mode continues to wave 11 after the boss.
  - Touch emulation at 844 × 390: joystick, look, FIRE and pause, plus mobile layouts in landscape and portrait.
  - Menus: Armory purchases, the achievements list, the skins gallery, and the loadout with its 3D preview and reroll.

## Poki preparation

- `PokiAdapter` wraps the official HTML5 SDK (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js`):
  - Calls `init()` and continues even if init fails (for example, because of an ad blocker).
  - Calls `gameLoadingFinished()` once.
  - De-duplicates `gameplayStart()` and `gameplayStop()`.
  - Calls `commercialBreak()` between runs, never during combat and never before the first run of a session.
  - Mutes audio and disables input while an ad plays.
  - `rewardedBreak()` drives the opt-in revive and grants it only when it resolves `true`.
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
| 2. Wave survival | Shooter archetype, upgrade cards between waves, wave composition table | ✅ Done |
| 3. Procedural content | Seeded weapon assembly (3 families, part pools, modules), weapon crates, hit zones, enemy variation | ✅ Done |
| 4. Roguelite progression | 10 waves + boss, Tank and Elite, mutations, achievements, skins, Scrap unlocks, challenges, Endless | ✅ Done |
| 5. UI & mobile | Loadout, menus, touch controls and mobile HUD, aim assist, accessibility settings | ✅ Done |
| 6. Poki preparation | Rewarded revive, lifecycle audit, local-only bundle, robustness | ✅ Done (Inspector run pending) |

Still open:

- **Poki Inspector run.** Upload a `dist/` zip to <https://inspector.poki.dev> and check the lifecycle and ad events there. The mock adapter has been verified, but the real SDK flow can only be confirmed in the Inspector.
- **Real-device testing.** Touch has only been tested in emulation so far. Use the GitHub Pages build to try it on actual phones and tablets.
- **Not built:** explosive props and environmental hazards were in the original Milestone 3 scope line but haven't been implemented.

## Third-party assets

- **Icons:** [Phosphor Icons](https://phosphoricons.com) (`@phosphor-icons/core`), "fill" weight, MIT licence. Only the icons imported in `src/ui/icons.ts` are bundled, and nothing is loaded from a CDN.
- **Font:** Chakra Petch via `@fontsource/chakra-petch`, SIL Open Font License 1.1.
