import type { ThemeId } from './ArenaTypes';

/** Colour palette and lighting for an arena theme. Colours are hex strings (#rrggbb). */
export interface ThemePalette {
  id: ThemeId;
  name: string;
  floorA: string;
  floorB: string;
  wall: string;
  cover: string;
  pillar: string;
  platform: string;
  stair: string;
  boundary: string;
  filler: string;
  topTint: string;
  trim: string;
  detail: string;
  accent: string;
  glow: string;
  glow2: string;
  backdrop: string;
  backdropDark: string;
  skyTop: string;
  skyHorizon: string;
  fog: string;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  ruins: {
    id: 'ruins', name: 'Emberwatch Ruins',
    floorA: '#c6a27b', floorB: '#b99a7a',
    wall: '#85839d', cover: '#8c879b', pillar: '#9790a5',
    platform: '#a69a8b', stair: '#b7a38c', boundary: '#858198', filler: '#78738b',
    topTint: '#a5a0aa', trim: '#323441', detail: '#64833a', accent: '#b67a38',
    glow: '#ff7026', glow2: '#ffbd53', backdrop: '#88829f', backdropDark: '#605b7b',
    skyTop: '#2864bb', skyHorizon: '#86b4e2', fog: '#8a9fbc',
    sunColor: '#ffd0a0', sunIntensity: 1.12,
    hemiSky: '#bbceff', hemiGround: '#927058', hemiIntensity: 0.82,
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial Facility',
    floorA: '#5e646c',
    floorB: '#565b63',
    wall: '#7d5140',
    cover: '#a0763a',
    pillar: '#6c737c',
    platform: '#646b73',
    stair: '#7a8189',
    boundary: '#4b4f57',
    filler: '#555a62',
    topTint: '#9aa1aa',
    trim: '#2c2f35',
    detail: '#e2a520',
    accent: '#f2b705',
    glow: '#ff7a1a',
    glow2: '#ffd04a',
    backdrop: '#3a3546',
    backdropDark: '#26222f',
    skyTop: '#241f3a',
    skyHorizon: '#c9705a',
    fog: '#6d5560',
    sunColor: '#ffc9a0',
    sunIntensity: 0.95,
    hemiSky: '#a9a6d6',
    hemiGround: '#4a4038',
    hemiIntensity: 0.66,
  },
  frozen: {
    id: 'frozen',
    name: 'Frozen Fortress',
    floorA: '#e3edf6',
    floorB: '#d5e2ee',
    wall: '#8db8dc',
    cover: '#a9cbe6',
    pillar: '#7da2c4',
    platform: '#b9d3ea',
    stair: '#c8dcee',
    boundary: '#5f7f9f',
    filler: '#7c9cbc',
    topTint: '#f6fbff',
    trim: '#3f5a78',
    detail: '#5ad0ff',
    accent: '#bfe9ff',
    glow: '#55e0ff',
    glow2: '#a6f4ff',
    backdrop: '#6f88a8',
    backdropDark: '#4d6382',
    skyTop: '#3d6aa8',
    skyHorizon: '#cfe4f5',
    fog: '#b7cfe4',
    sunColor: '#f2f7ff',
    sunIntensity: 0.9,
    hemiSky: '#dbeaff',
    hemiGround: '#7d93ad',
    hemiIntensity: 0.7,
  },
  neon: {
    id: 'neon',
    name: 'Neon City',
    floorA: '#2a2347',
    floorB: '#241e3f',
    wall: '#3b2f6a',
    cover: '#4a3a7d',
    pillar: '#33295c',
    platform: '#3a3168',
    stair: '#463b7a',
    boundary: '#211a3d',
    filler: '#2c2452',
    topTint: '#6b5bb0',
    trim: '#16112b',
    detail: '#19e6ff',
    accent: '#ff3fd2',
    glow: '#ff2fd0',
    glow2: '#19e6ff',
    backdrop: '#2a2150',
    backdropDark: '#1a1436',
    skyTop: '#0d0820',
    skyHorizon: '#5a2a8a',
    fog: '#3a2466',
    sunColor: '#c8a8ff',
    sunIntensity: 0.7,
    hemiSky: '#8f7bff',
    hemiGround: '#3a1f4f',
    hemiIntensity: 0.85,
  },
};
