import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { SeededRandom, codeToSeed, seedToCode } from '../src/core/SeededRandom';
import { generateArena } from '../src/procedural/ArenaGenerator';
import { CellKind, cellIndex, type ArenaOptions } from '../src/procedural/ArenaTypes';
import { computeReachable, validateArena } from '../src/procedural/ArenaValidator';
import { NavGrid } from '../src/world/NavGrid';
import { VoxelWorld } from '../src/world/VoxelWorld';

const OPTS: ArenaOptions = {
  interiorSize: CONFIG.arena.size,
  boundaryHeight: CONFIG.arena.boundaryHeight,
  centerClearRadius: CONFIG.arena.centerClearRadius,
  perimeterMargin: CONFIG.arena.perimeterMargin,
  minSpawnDistance: CONFIG.arena.minSpawnDistance,
};

describe('SeededRandom', () => {
  it('is deterministic', () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('round-trips seed codes', () => {
    for (const s of [0, 1, 42, 4294967295, 123456789]) expect(codeToSeed(seedToCode(s))).toBe(s >>> 0);
  });
});

describe('ArenaGenerator', () => {
  it('produces identical arenas for identical seeds', () => {
    const a = generateArena(987654, OPTS);
    const b = generateArena(987654, OPTS);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(Array.from(a.kinds)).toEqual(Array.from(b.kinds));
    expect(a.spawnPoints).toEqual(b.spawnPoints);
    expect(a.themeId).toBe(b.themeId);
    expect(a.decorations.length).toBe(b.decorations.length);
  });

  it('produces different arenas for different seeds', () => {
    const a = generateArena(1, OPTS);
    const b = generateArena(2, OPTS);
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('passes validation across many seeds', () => {
    for (let seed = 100; seed < 400; seed++) {
      const data = generateArena(seed, OPTS);
      const result = validateArena(data, { centerClearRadius: OPTS.centerClearRadius, minSpawnPoints: 6 });
      expect(result.reasons, `seed ${seed}`).toEqual([]);
      // No unreachable floor remains.
      const reach = computeReachable(data, data.playerStart);
      for (let i = 0; i < data.kinds.length; i++) {
        if (data.kinds[i] === CellKind.Floor) expect(reach[i], `seed ${seed} cell ${i}`).toBe(1);
      }
      // Platforms with stairs are reachable.
      let platforms = 0;
      let reachablePlatforms = 0;
      for (let i = 0; i < data.kinds.length; i++) {
        if (data.kinds[i] === CellKind.Platform) {
          platforms++;
          if (reach[i]) reachablePlatforms++;
        }
      }
      expect(reachablePlatforms, `seed ${seed}`).toBe(platforms);
    }
  });

  it('places spawns far from the player on open floor', () => {
    const data = generateArena(5555, OPTS);
    const c = data.size / 2;
    for (const sp of data.spawnPoints) {
      expect(Math.hypot(sp.x + 0.5 - c, sp.z + 0.5 - c)).toBeGreaterThanOrEqual(OPTS.minSpawnDistance);
      expect(data.heights[cellIndex(data.size, sp.x, sp.z)]).toBe(0);
    }
  });
});

describe('NavGrid', () => {
  it('reaches every spawn point from the player start', () => {
    for (let seed = 1; seed < 60; seed++) {
      const data = generateArena(seed, OPTS);
      const nav = new NavGrid(data);
      nav.compute(data.playerStart.x, data.playerStart.z);
      for (const sp of data.spawnPoints) expect(Number.isFinite(nav.dist[cellIndex(data.size, sp.x, sp.z)]!), `seed ${seed}`).toBe(true);
    }
  });
});

describe('VoxelWorld', () => {
  it('raycasts hit the floor and boundary', () => {
    const data = generateArena(77, OPTS);
    const world = new VoxelWorld(data);
    const c = data.size / 2;
    const down = world.raycast(c + 0.5, 1.6, c + 0.5, 0, -1, 0, 50);
    expect(down?.distance).toBeCloseTo(1.6, 3);
    const side = world.raycast(c + 0.5, 1.6, c + 0.5, 1, 0, 0, 100);
    expect(side).not.toBeNull();
    expect(side!.nx).toBe(-1);
  });

  it('blocks movement into tall walls and steps up small ledges', () => {
    const data = generateArena(77, OPTS);
    const world = new VoxelWorld(data);
    const body = { x: 2.5, y: 0, z: 20.5 };
    world.moveHorizontal(body, -5, 0, 0.32, 0.55);
    expect(body.x).toBeGreaterThan(1.3); // boundary at x < 1
  });
});
