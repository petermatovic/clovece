/**
 * Definície hracích plôch. Téma je čistý popis (farby, materiálové parametre,
 * svetelný preset) — geometria je pre všetky témy rovnaká, líši sa len vzhľad.
 * Vďaka tomu pridanie novej plochy znamená pridať objekt sem, nič viac.
 */

import type { Texture } from 'three';
import { candyTexture, darkTexture, marbleTexture, woodTexture } from './textures';

export type ThemeId = 'wood' | 'marble' | 'neon' | 'candy';
/** Ako sa kreslia jednotlivé polia dráhy. */
export type FieldStyle = 'inset' | 'inlay' | 'neon' | 'candy';

export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Vytvorí textúru dosky. Volá sa lenivo až pri stavaní scény. */
  boardTexture: () => Texture;
  board: { color: string; roughness: number; metalness: number; clearcoat: number };
  frame: { color: string; roughness: number; metalness: number };
  field: {
    style: FieldStyle;
    color: string;
    /** Intenzita vlastného svietenia polí (0 = nesvietia). */
    emissiveIntensity: number;
    /** Farba obruby/okraja poľa. */
    rimColor: string;
  };
  /** Pozadie scény — lineárny gradient zhora nadol. */
  background: { top: string; bottom: string };
  light: {
    sunColor: string;
    sunIntensity: number;
    ambientColor: string;
    ambientIntensity: number;
    /** Pozícia slnka; ovplyvňuje smer a dĺžku tieňov. */
    sunPosition: [number, number, number];
  };
  /** Hviezdne pozadie (len sci-fi téma). */
  stars: boolean;
  /** Farebný nádych materiálu figúrok — mení celkovú náladu plochy. */
  pieceFinish: { roughness: number; metalness: number; clearcoat: number };
}

export const THEMES: Theme[] = [
  {
    id: 'wood',
    name: 'Klasik — drevo',
    tagline: 'Teplá drevená doska s mosadzným rámom. Ako z detstva.',
    boardTexture: () => woodTexture(),
    board: { color: '#d9a668', roughness: 0.62, metalness: 0.0, clearcoat: 0.25 },
    frame: { color: '#8a6a2f', roughness: 0.35, metalness: 0.85 },
    field: { style: 'inset', color: '#f0dcbc', emissiveIntensity: 0, rimColor: '#7a5326' },
    background: { top: '#2c2a33', bottom: '#0f0e12' },
    light: {
      sunColor: '#fff2dd',
      sunIntensity: 2.6,
      ambientColor: '#6f6a7a',
      ambientIntensity: 0.55,
      sunPosition: [7, 12, 5],
    },
    stars: false,
    pieceFinish: { roughness: 0.28, metalness: 0.05, clearcoat: 0.9 },
  },
  {
    id: 'marble',
    name: 'Mramor & zlato',
    tagline: 'Chladný biely mramor, polia vykladané zlatom.',
    boardTexture: () => marbleTexture(),
    board: { color: '#ffffff', roughness: 0.22, metalness: 0.05, clearcoat: 1.0 },
    frame: { color: '#d4af37', roughness: 0.18, metalness: 1.0 },
    field: { style: 'inlay', color: '#e8c766', emissiveIntensity: 0, rimColor: '#b08d2c' },
    background: { top: '#3a3f4b', bottom: '#14161c' },
    light: {
      sunColor: '#ffffff',
      sunIntensity: 3.0,
      ambientColor: '#8892a6',
      ambientIntensity: 0.7,
      sunPosition: [6, 14, 7],
    },
    stars: false,
    pieceFinish: { roughness: 0.12, metalness: 0.2, clearcoat: 1.0 },
  },
  {
    id: 'neon',
    name: 'Neón',
    tagline: 'Tmavá doska, svietiace polia, hviezdy v pozadí.',
    boardTexture: () => darkTexture(),
    board: { color: '#1a1d28', roughness: 0.85, metalness: 0.1, clearcoat: 0.15 },
    frame: { color: '#2de2e6', roughness: 0.3, metalness: 0.7 },
    field: { style: 'neon', color: '#2de2e6', emissiveIntensity: 1.6, rimColor: '#2de2e6' },
    background: { top: '#0b0a1a', bottom: '#01010a' },
    light: {
      sunColor: '#bcd4ff',
      sunIntensity: 1.5,
      ambientColor: '#3a2f6b',
      ambientIntensity: 0.85,
      sunPosition: [4, 11, 6],
    },
    stars: true,
    pieceFinish: { roughness: 0.2, metalness: 0.45, clearcoat: 1.0 },
  },
  {
    id: 'candy',
    name: 'Cukríky',
    tagline: 'Pastelové farby a mäkké tvary. Veselá plocha pre deti.',
    boardTexture: () => candyTexture(),
    board: { color: '#fff6ee', roughness: 0.55, metalness: 0.0, clearcoat: 0.6 },
    frame: { color: '#ff9ec4', roughness: 0.4, metalness: 0.1 },
    field: { style: 'candy', color: '#ffffff', emissiveIntensity: 0.08, rimColor: '#ffb3d1' },
    background: { top: '#bfe6ff', bottom: '#ffe3f1' },
    light: {
      sunColor: '#ffffff',
      sunIntensity: 2.8,
      ambientColor: '#ffe9f4',
      ambientIntensity: 1.0,
      sunPosition: [5, 13, 6],
    },
    stars: false,
    pieceFinish: { roughness: 0.35, metalness: 0.0, clearcoat: 0.7 },
  },
];

export function getTheme(id: ThemeId): Theme {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) throw new Error(`Neznáma téma: ${id}`);
  return theme;
}
