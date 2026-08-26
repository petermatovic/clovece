/**
 * Topológia hracej dosky — čistá matematika, žiadna geometria.
 *
 * Hlavná dráha má 40 polí s absolútnymi indexmi 0..39 (v smere hodinových ručičiek).
 * Štartové pole hráča `p` je `p * FIELDS_PER_PLAYER`, teda 0, 10, 20, 30.
 *
 * Namiesto absolútnych indexov sa v pravidlách počíta so „vzdialenosťou od štartu"
 * (`distance`), ktorá je pre každého hráča 0..39 na dráhe a 40..43 v domčeku.
 * Vďaka tomu je logika posunu pre všetkých hráčov identická a nemusí sa nikde
 * riešiť pretečenie cez index 39 → 0.
 */

import type { PieceLocation, PlayerIndex } from './types';

export const PLAYER_COUNT_MAX = 4;
export const PIECES_PER_PLAYER = 4;
export const TRACK_LENGTH = 40;
export const FIELDS_PER_PLAYER = TRACK_LENGTH / PLAYER_COUNT_MAX; // 10
export const HOME_SLOTS = PIECES_PER_PLAYER; // 4
/** Najväčšia platná vzdialenosť: 39 na dráhe + 4 domčekové polia = 43. */
export const MAX_DISTANCE = TRACK_LENGTH + HOME_SLOTS - 1; // 43

/** Absolútny index štartového poľa hráča. */
export function startField(player: PlayerIndex): number {
  return player * FIELDS_PER_PLAYER;
}

/**
 * Absolútny index posledného poľa dráhy pred odbočením do domčeka.
 * Je to pole tesne „pred" vlastným štartom, teda po celom okruhu.
 */
export function homeEntryField(player: PlayerIndex): number {
  return (startField(player) + TRACK_LENGTH - 1) % TRACK_LENGTH;
}

/** Prevod absolútneho poľa dráhy na vzdialenosť od štartu daného hráča (0..39). */
export function trackPosToDistance(player: PlayerIndex, pos: number): number {
  return (pos - startField(player) + TRACK_LENGTH) % TRACK_LENGTH;
}

/** Prevod vzdialenosti od štartu na absolútne pole dráhy. Platí len pre distance < 40. */
export function distanceToTrackPos(player: PlayerIndex, distance: number): number {
  return (startField(player) + distance) % TRACK_LENGTH;
}

/**
 * Vzdialenosť figúrky od štartu.
 * Pre figúrku vo dvore vracia -1 (ešte nie je v hre).
 */
export function locationDistance(player: PlayerIndex, loc: PieceLocation): number {
  switch (loc.kind) {
    case 'yard':
      return -1;
    case 'track':
      return trackPosToDistance(player, loc.pos);
    case 'home':
      return TRACK_LENGTH + loc.slot;
  }
}

/** Opačný prevod: vzdialenosť 0..43 → pozícia. Mimo rozsah vyhodí chybu. */
export function distanceToLocation(player: PlayerIndex, distance: number): PieceLocation {
  if (distance < 0 || distance > MAX_DISTANCE) {
    throw new RangeError(`Neplatná vzdialenosť ${distance} (povolené 0..${MAX_DISTANCE})`);
  }
  if (distance < TRACK_LENGTH) {
    return { kind: 'track', pos: distanceToTrackPos(player, distance) };
  }
  return { kind: 'home', slot: distance - TRACK_LENGTH };
}

/** Porovnanie dvoch pozícií (na test a hľadanie kolízií). */
export function sameLocation(a: PieceLocation, b: PieceLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'track' && b.kind === 'track') return a.pos === b.pos;
  if (a.kind === 'home' && b.kind === 'home') return a.slot === b.slot;
  return a.kind === 'yard' && b.kind === 'yard';
}
