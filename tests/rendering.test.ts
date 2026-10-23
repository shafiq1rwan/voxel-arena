import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CONFIG } from '../src/config';
import { generateArena } from '../src/procedural/ArenaGenerator';
import { THEMES } from '../src/procedural/Themes';
import { MaterialLibrary } from '../src/render/Materials';
import { ArenaRenderer } from '../src/world/ArenaRenderer';
import { SeededRandom } from '../src/core/SeededRandom';
import { fortressDecor } from '../src/procedural/FortressDecor';

describe('Fortress rendering lifecycle', () => {
  it('keeps merged geometry valid and disposes old meshes across retries and biome changes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new MaterialLibrary(scene);
    const renderer = new ArenaRenderer(scene, materials);
    try {
      for (const themeId of ['ruins', 'frozen', 'industrial', 'neon', 'ruins'] as const) {
        const arena = generateArena(120, { ...CONFIG.arena, interiorSize: CONFIG.arena.size, themeId });
        const heights = new Float32Array(arena.heights);
        const previous = [...renderer.meshes];
        renderer.build(arena, THEMES[themeId]);
        expect(previous.every(mesh => mesh.isDisposed())).toBe(true);
        expect(renderer.meshes.length).toBeLessThanOrEqual(3);
        expect(scene.meshes.length).toBe(renderer.meshes.length);
        for (const mesh of renderer.meshes) {
          expect(mesh.getTotalVertices()).toBeGreaterThan(0);
          expect(mesh.getVerticesData('position')!.every(Number.isFinite)).toBe(true);
        }
        // Art decoration must never mutate the movement / hitscan / AI heightmap.
        expect(arena.heights).toEqual(heights);
        // Every theme gets fortress dressing, deterministically.
        expect(arena.decorations.length).toBeGreaterThan(200);
        expect(fortressDecor(arena, new SeededRandom(5))).toEqual(fortressDecor(arena, new SeededRandom(5)));
      }
      renderer.dispose();
      expect(scene.meshes).toHaveLength(0);
    } finally {
      materials.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
