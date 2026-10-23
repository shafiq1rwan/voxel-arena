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
  /** Clouds, smoke and snow. */
  cloud: string;
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
    id: 'ruins',
    name: 'Emberwatch Ruins',
    floorA: '#c6a27b',
    floorB: '#b99a7a',
    wall: '#85839d',
    cover: '#8c879b',
    pillar: '#9790a5',
    platform: '#a69a8b',
    stair: '#b7a38c',
    boundary: '#858198',
    filler: '#78738b',
    topTint: '#a5a0aa',
    trim: '#323441',
    detail: '#64833a',
    accent: '#b67a38',
    glow: '#ff7026',
    glow2: '#ffbd53',
    backdrop: '#88829f',
    backdropDark: '#605b7b',
    cloud: '#eef4fb',
    skyTop: '#2864bb',
    skyHorizon: '#86b4e2',
    fog: '#8a9fbc',
    sunColor: '#ffd0a0',
    sunIntensity: 1.12,
    hemiSky: '#bbceff',
    hemiGround: '#927058',
    hemiIntensity: 0.82,
  },
  industrial: {
    id: 'industrial',
    name: 'Foundry Citadel',
    floorA: '#77736e',
    floorB: '#6c6863',
    wall: '#7a6658',
    cover: '#86705a',
    pillar: '#6d6662',
    platform: '#7d7670',
    stair: '#8a847e',
    boundary: '#6a5f57',
    filler: '#625851',
    topTint: '#a59c93',
    trim: '#2c2b2e',
    detail: '#9a4f25',
    accent: '#e8a317',
    glow: '#ff7a1a',
    glow2: '#ffb347',
    backdrop: '#6b625c',
    backdropDark: '#47403c',
    cloud: '#5f5654',
    skyTop: '#3a2d47',
    skyHorizon: '#e08e5f',
    fog: '#a07a68',
    sunColor: '#ffc9a0',
    sunIntensity: 1.0,
    hemiSky: '#cbbcd6',
    hemiGround: '#5a4a40',
    hemiIntensity: 0.74,
  },
  frozen: {
    id: 'frozen',
    name: 'Frostspire Keep',
    floorA: '#e8eff6',
    floorB: '#dbe5ef',
    wall: '#8fa4bc',
    cover: '#9fb3c9',
    pillar: '#8297b0',
    platform: '#aabed3',
    stair: '#bfcfe1',
    boundary: '#7d91aa',
    filler: '#73879f',
    topTint: '#eef4fb',
    trim: '#3b4b61',
    detail: '#e2f5ff',
    accent: '#6fb4e3',
    glow: '#55e0ff',
    glow2: '#9ff1ff',
    backdrop: '#8599b2',
    backdropDark: '#5f728b',
    cloud: '#f6f9fd',
    skyTop: '#4a7cc0',
    skyHorizon: '#d9e9f6',
    fog: '#c7d8e9',
    sunColor: '#f4f8ff',
    sunIntensity: 0.95,
    hemiSky: '#e1edff',
    hemiGround: '#8297b0',
    hemiIntensity: 0.74,
  },
  neon: {
    id: 'neon',
    name: 'Neon Citadel',
    floorA: '#30295a',
    floorB: '#2a234f',
    wall: '#433a74',
    cover: '#4d4383',
    pillar: '#3b3268',
    platform: '#463d78',
    stair: '#51478a',
    boundary: '#352d5f',
    filler: '#2f2856',
    topTint: '#7a6cc4',
    trim: '#15112a',
    detail: '#1d1834',
    accent: '#ff3fd2',
    glow: '#ff2fd0',
    glow2: '#19e6ff',
    backdrop: '#3a3168',
    backdropDark: '#241e46',
    cloud: '#3b2c6e',
    skyTop: '#0d0820',
    skyHorizon: '#5a2a8a',
    fog: '#3a2466',
    sunColor: '#c8a8ff',
    sunIntensity: 0.75,
    hemiSky: '#9584ff',
    hemiGround: '#3a1f4f',
    hemiIntensity: 0.9,
  },
};
