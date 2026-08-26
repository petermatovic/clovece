/**
 * Ukladanie do localStorage: nastavenia hry a rozohraná partia.
 *
 * Uložený stav je čistý JSON `GameState` — keďže herné jadro nemá väzbu na
 * Three.js, dá sa stav uložiť a obnoviť bez akejkoľvek konverzie.
 */

import type { GameState } from '../core/types';
import type { ThemeId } from '../render/themes';
import type { ShadowQuality } from '../render/scene';

const SETTINGS_KEY = 'clovece.settings';
const SAVE_KEY = 'clovece.save';
/** Zvýšiť pri nekompatibilnej zmene tvaru GameState — staré uloženie sa zahodí. */
const SAVE_VERSION = 1;

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  pieceColorId: string;
  diceColorId: string;
}

export interface Settings {
  players: PlayerSetup[];
  themeId: ThemeId;
  shadowQuality: ShadowQuality;
  /** Násobič rýchlosti animácií. */
  animationSpeed: number;
  /** Automaticky potvrdiť ťah, keď je legálny len jeden. */
  autoSingleMove: boolean;
  /** Otáčať kameru k hráčovi na ťahu. */
  rotateCamera: boolean;
}

export interface SavedGame {
  version: number;
  state: GameState;
  themeId: ThemeId;
}

export function loadSettings(): Partial<Settings> {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Settings>;
  } catch {
    return {};
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function saveGame(state: GameState, themeId: ThemeId): void {
  const payload: SavedGame = { version: SAVE_VERSION, state, themeId };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function loadGame(): SavedGame | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.version !== SAVE_VERSION) return null;
    if (parsed.state.phase === 'GAME_OVER') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function hasSave(): boolean {
  return loadGame() !== null;
}
