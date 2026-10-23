# Fortress visual update — 23 October 2026

Updated the existing local project in place. The prior source is backed up in the Codex chat workspace under work/original-voxel-arena/src.

## Changes
- Default biome: Emberwatch Ruins, with cool violet-grey stone, sandy paving and warm amber lanterns.
- Individual staggered masonry courses, recessed joints, paving variation and cracks.
- Perimeter niches, stepped arches, cornices, battlements, vines and four landmark gatehouses.
- Sun shadows on medium/high quality, fixed lantern lights and reduced bloom.
- More detailed rifle receiver, vented handguard, open reflex sight, muzzle, gloves and sleeves.
- Enemy shoulder armour, boots, shin plates, helmets, jaw guards, belts and glowing chest cores.
- Existing HUD, movement, collision heightmap, AI navigation, weapon stats, waves and progression preserved.
- Fortress appears on normal entry. Existing biomes are still available with ?theme=frozen, ?theme=industrial or ?theme=neon.

## Run
Use npm install if dependencies are missing, then npm run dev. Open the URL printed by Vite. Use npm run build for a production build and npm test for the automated suite. dist/ is the production game; it does not include the browser test harness.

## Validation
- TypeScript and production build passed.
- 13 automated tests passed, including merged geometry validity, render mesh disposal on repeated arena changes, deterministic decoration, heightmap integrity and existing wave/navigation/collision tests.
- Browser smoke test passed 11 checks: fortress startup, movement, jump, firing, reload, spawning, pursuit, pause, resume, enemy damage/death/results, and retry reset.
- Browser rendering was visually inspected. No mobile-device or Poki submission testing was performed in this pass.

## Repeat the browser test
Start an isolated QA origin to avoid writing test records to your normal play origin:

    node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort

Open /tests/browser-smoke.html?test&autostart&seed=FORTRESS on that origin. It advances the actual game update loop deterministically, reports PASS/FAIL, and leaves a paused mid-wave scene. This avoids relying on animation timing in background browser previews. It also exercises normal save/retry behavior, so keep it on the QA origin. Its view controls are test-page controls, not game features.

## Visual scope
This is a code-built visual pass toward the pitch, not a pixel-identical recreation of the concept image. It does not add the pitch's tank, flying enemies, elaborate effects, extra weapon families, achievement gallery, upgrades or mobile controls. Decorative wall niches are not traversable doors. Architectural decoration is visual; existing heightmap solids remain authoritative for movement and hitscan. Low quality disables shadows and bloom.
