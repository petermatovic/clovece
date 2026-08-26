/**
 * Spoločné konštanty a predvoľby, ktoré potrebuje UI aj renderer.
 */

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  /** Kontrastná farba bodiek na kocke tejto farby. */
  pip: string;
}

/** Paleta farieb figúrok aj kociek. */
export const COLOR_OPTIONS: ColorOption[] = [
  { id: 'red', name: 'Červená', hex: '#e2453c', pip: '#ffffff' },
  { id: 'blue', name: 'Modrá', hex: '#3b7ddd', pip: '#ffffff' },
  { id: 'green', name: 'Zelená', hex: '#3aa856', pip: '#ffffff' },
  { id: 'yellow', name: 'Žltá', hex: '#e8b93a', pip: '#3a2f00' },
  { id: 'purple', name: 'Fialová', hex: '#8b5cd6', pip: '#ffffff' },
  { id: 'orange', name: 'Oranžová', hex: '#ec7a2c', pip: '#ffffff' },
  { id: 'black', name: 'Čierna', hex: '#2b2f38', pip: '#f2f2f2' },
  { id: 'white', name: 'Biela', hex: '#f3efe6', pip: '#2b2f38' },
];

export function colorById(id: string): ColorOption {
  return COLOR_OPTIONS.find((c) => c.id === id) ?? COLOR_OPTIONS[0];
}

export function colorByHex(hex: string): ColorOption {
  return COLOR_OPTIONS.find((c) => c.hex.toLowerCase() === hex.toLowerCase()) ?? COLOR_OPTIONS[0];
}

/** Predvolené farby pre hráčov 1..4 v poradí. */
export const DEFAULT_PLAYER_COLORS = ['red', 'blue', 'green', 'yellow'];

export const DEFAULT_PLAYER_NAMES = ['Hráč 1', 'Hráč 2', 'Hráč 3', 'Hráč 4'];

/** Ako dlho AI „premýšľa", aby bol jej ťah pre ľudí čitateľný (ms). */
export const AI_THINK_MS = 620;
/** Trvanie skoku figúrky cez jedno pole (s). */
export const HOP_SECONDS = 0.17;
