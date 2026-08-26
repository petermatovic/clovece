/**
 * Heuristický počítačový hráč. Žiadne prehľadávanie do hĺbky — len ohodnotenie
 * jednotlivých ťahov, čo pre túto hru stačí a je to čitateľné a rýchle.
 *
 * Priority (od najvyššej):
 *   1. dobehnúť figúrku do domčeka
 *   2. vyhodiť súpera
 *   3. nasadiť novú figúrku pri šestke
 *   4. utiecť z ohrozeného poľa
 *   5. posunúť najpokročilejšiu figúrku
 */

import { TRACK_LENGTH, locationDistance, startField, trackPosToDistance } from './board';
import type { GameState, Move, PlayerIndex } from './types';

/** Maximálny hod — dokedy dopredu súper ohrozuje. */
const DICE_MAX = 6;

/**
 * Je pole `pos` ohrozené niektorým súperom hráča `player`?
 * Ohrozuje ho súperova figúrka, ktorá je 1..6 polí za ním a ešte neodbočila do domčeka,
 * a tiež súper s figúrkou vo dvore, ak je `pos` jeho štartové pole (nasadí šestkou).
 */
export function isFieldThreatened(
  state: GameState,
  player: PlayerIndex,
  pos: number,
): boolean {
  return state.pieces.some((piece) => {
    if (piece.owner === player) return false;

    if (piece.location.kind === 'yard') {
      return startField(piece.owner) === pos;
    }
    if (piece.location.kind !== 'track') return false;

    const gap = (pos - piece.location.pos + TRACK_LENGTH) % TRACK_LENGTH;
    if (gap < 1 || gap > DICE_MAX) return false;
    // Súper by medzitým odbočil do domčeka a na toto pole by sa vôbec nedostal.
    const attackerDistance = trackPosToDistance(piece.owner, piece.location.pos);
    return attackerDistance + gap < TRACK_LENGTH;
  });
}

/** Ohodnotenie ťahu. Vyššie číslo = lepší ťah. */
export function scoreMove(state: GameState, move: Move): number {
  const player = state.current;
  let score = 0;

  // 1. Dobehnutie do domčeka je vždy zisk, ktorý sa už nedá stratiť.
  if (move.to.kind === 'home') score += 1000;

  // 2. Vyhodenie súpera — tým cennejšie, čím ďalej súperova figúrka došla.
  if (move.capturesPieceIndex !== null) {
    const victim = state.pieces[move.capturesPieceIndex];
    score += 700 + locationDistance(victim.owner, victim.location) * 5;
  }

  // 3. Nasadenie novej figúrky rozširuje možnosti a uvoľňuje dvor.
  if (move.kind === 'enter') score += 400;

  // 4. Útek z ohrozeného poľa / nevstupovanie do ohrozenia.
  if (move.from.kind === 'track' && isFieldThreatened(state, player, move.from.pos)) {
    score += 250;
  }
  if (move.to.kind === 'track' && isFieldThreatened(state, player, move.to.pos)) {
    score -= 200;
  }

  // 5. Pri rovnosti uprednostní najpokročilejšiu figúrku (rýchlejšie ju dostane domov).
  score += locationDistance(player, move.to);

  return score;
}

/** Vyberie najlepší ťah zo zoznamu. Zoznam nesmie byť prázdny. */
export function chooseMove(state: GameState, moves: Move[]): Move {
  if (moves.length === 0) throw new Error('AI dostala prázdny zoznam ťahov.');
  let best = moves[0];
  let bestScore = scoreMove(state, moves[0]);
  for (let i = 1; i < moves.length; i++) {
    const score = scoreMove(state, moves[i]);
    if (score > bestScore) {
      best = moves[i];
      bestScore = score;
    }
  }
  return best;
}
