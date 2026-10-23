/**
 * Pure data description of a generated arena. Contains no Babylon.js objects so it can be
 * generated, validated and unit-tested in isolation, then turned into meshes by ArenaRenderer.
 *
 * The arena is a column heightmap on a 1 m grid. Cell (x, z) spans world [x, x+1] × [z, z+1].
 * Heights are multiples of 0.5 m, which lets staircases (0.5 m steps) connect raised platforms.
 */
export enum CellKind {
  Floor = 0,
  Wall = 1,
  Cover = 2,
  Pillar = 3,
  Platform = 4,
  Stair = 5,
  Boundary = 6,
  Filler = 7,
}

export type ThemeId = 'ruins' | 'industrial' | 'frozen' | 'neon';
export type SymmetryMode = 'none' | 'mirrorX' | 'mirrorXZ' | 'rot2';

export interface GridPoint {
  x: number;
  z: number;
}

/** Colour slot used by decorative boxes; resolved against the theme palette at render time. */
export type DecorSlot = 'trim' | 'detail' | 'accent' | 'glow' | 'glow2' | 'backdrop' | 'backdropDark' | 'cloud';

/** Axis-aligned decorative box in world space (non-colliding, placed only where players can't reach). */
export interface DecorBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  slot: DecorSlot;
  /** If set, this glowing box also casts a baked pool of light with this radius (metres). */
  light?: number;
}

export interface ArenaData {
  seed: number;
  themeId: ThemeId;
  symmetry: SymmetryMode;
  /** Grid dimension including the one-cell boundary ring. */
  size: number;
  heights: Float32Array;
  kinds: Uint8Array;
  playerStart: GridPoint;
  spawnPoints: GridPoint[];
  pickupPoints: GridPoint[];
  decorations: DecorBox[];
  /** Number of generation attempts needed to pass validation (debug info). */
  attempts: number;
}

export interface ArenaOptions {
  /** Playable interior size in cells/metres. */
  interiorSize: number;
  themeId?: ThemeId;
  /** Themes the seed may pick from (unlocked themes); defaults to all. */
  themePool?: ThemeId[];
  boundaryHeight: number;
  centerClearRadius: number;
  perimeterMargin: number;
  minSpawnDistance: number;
}

export const THEME_IDS: readonly ThemeId[] = ['ruins', 'industrial', 'frozen', 'neon'];

export const STEP_HEIGHT = 0.55;

export function cellIndex(size: number, x: number, z: number): number {
  return z * size + x;
}
