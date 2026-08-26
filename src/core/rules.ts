/**
 * Pravidlá hry — čisté funkcie nad `GameState`.
 *
 * Štandardné slovenské/české pravidlá:
 *  - Figúrka sa nasadzuje len na šestku, na vlastné štartové pole.
 *  - Po šestke sa hádže znova.
 *  - Súperova figúrka na cieľovom poli sa vyhadzuje späť do dvora.
 *  - Vlastná figúrka na cieľovom poli robí ťah nelegálnym.
 *  - Do domčeka sa vchádza presným počtom; v domčeku sa nepreskakuje.
 */

import {
  MAX_DISTANCE,
  PIECES_PER_PLAYER,
  TRACK_LENGTH,
  distanceToLocation,
  locationDistance,
  startField,
} from './board';
import type { GameState, Move, Piece, PieceLocation, PlayerIndex } from './types';

/** Vytvorí počiatočný stav: všetky figúrky vo dvore, na ťahu hráč 0. */
export function createInitialPieces(playerCount: number): Piece[] {
  const pieces: Piece[] = [];
  for (let p = 0; p < playerCount; p++) {
    for (let i = 0; i < PIECES_PER_PLAYER; i++) {
      pieces.push({ id: i, owner: p as PlayerIndex, location: { kind: 'yard' } });
    }
  }
  return pieces;
}

/** Figúrka stojaca na danom poli dráhy (ktorákoľvek), alebo null. */
export function pieceIndexAtTrack(state: GameState, pos: number): number | null {
  const idx = state.pieces.findIndex((p) => p.location.kind === 'track' && p.location.pos === pos);
  return idx === -1 ? null : idx;
}

/** Figúrka hráča v konkrétnom domčekovom slote, alebo null. */
export function pieceIndexAtHome(
  state: GameState,
  player: PlayerIndex,
  slot: number,
): number | null {
  const idx = state.pieces.findIndex(
    (p) => p.owner === player && p.location.kind === 'home' && p.location.slot === slot,
  );
  return idx === -1 ? null : idx;
}

/** Má hráč aspoň jednu figúrku na hlavnej dráhe? */
export function hasPieceOnTrack(state: GameState, player: PlayerIndex): boolean {
  return state.pieces.some((p) => p.owner === player && p.location.kind === 'track');
}

/** Má hráč aspoň jednu figúrku vo dvore? */
export function hasPieceInYard(state: GameState, player: PlayerIndex): boolean {
  return state.pieces.some((p) => p.owner === player && p.location.kind === 'yard');
}

/** Sú všetky figúrky hráča v domčeku? */
export function hasPlayerFinished(state: GameState, player: PlayerIndex): boolean {
  return state.pieces
    .filter((p) => p.owner === player)
    .every((p) => p.location.kind === 'home');
}

/**
 * Zoznam polí, cez ktoré figúrka pri ťahu prejde (bez východiskového, vrátane cieľového).
 * Renderer podľa toho animuje skok pole-po-poli.
 */
function buildPath(player: PlayerIndex, fromDistance: number, toDistance: number): PieceLocation[] {
  const path: PieceLocation[] = [];
  for (let d = fromDistance + 1; d <= toDistance; d++) {
    path.push(distanceToLocation(player, d));
  }
  return path;
}

/**
 * Vygeneruje všetky legálne ťahy pre aktuálneho hráča pri danom hode.
 * Prázdne pole = hráč nemôže ťahať a ťah prepadá.
 */
export function getLegalMoves(state: GameState, roll: number): Move[] {
  const player = state.current;
  const moves: Move[] = [];

  state.pieces.forEach((piece, pieceIndex) => {
    if (piece.owner !== player) return;

    // --- Nasadenie z dvora (len na šestku) ---
    if (piece.location.kind === 'yard') {
      if (roll !== 6) return;
      const target = startField(player);
      const occupantIndex = pieceIndexAtTrack(state, target);
      // Vlastná figúrka na štartovom poli blokuje nasadenie.
      if (occupantIndex !== null && state.pieces[occupantIndex].owner === player) return;
      moves.push({
        pieceIndex,
        from: piece.location,
        to: { kind: 'track', pos: target },
        kind: 'enter',
        capturesPieceIndex: occupantIndex,
        path: [{ kind: 'track', pos: target }],
      });
      return;
    }

    // --- Posun po dráhe alebo v domčeku ---
    const fromDistance = locationDistance(player, piece.location);
    const toDistance = fromDistance + roll;
    // Do domčeka sa vchádza presne — prehodenie je nelegálne.
    if (toDistance > MAX_DISTANCE) return;

    const to = distanceToLocation(player, toDistance);

    if (to.kind === 'home') {
      // V domčeku sa nepreskakuje: každé pole od vstupu po cieľ musí byť voľné.
      const firstHomeDistance = Math.max(TRACK_LENGTH, fromDistance + 1);
      for (let d = firstHomeDistance; d <= toDistance; d++) {
        if (pieceIndexAtHome(state, player, d - TRACK_LENGTH) !== null) return;
      }
      moves.push({
        pieceIndex,
        from: piece.location,
        to,
        kind: piece.location.kind === 'home' ? 'homeAdvance' : 'enterHome',
        capturesPieceIndex: null,
        path: buildPath(player, fromDistance, toDistance),
      });
      return;
    }

    // Cieľ je na dráhe. Preskakovanie po dráhe je povolené, rozhoduje len cieľové pole.
    // (`distanceToLocation` nikdy nevráti 'yard', ale typ to nevie — preto explicitná stráž.)
    if (to.kind !== 'track') return;
    const occupantIndex = pieceIndexAtTrack(state, to.pos);
    if (occupantIndex !== null && state.pieces[occupantIndex].owner === player) return;
    moves.push({
      pieceIndex,
      from: piece.location,
      to,
      kind: 'advance',
      capturesPieceIndex: occupantIndex,
      path: buildPath(player, fromDistance, toDistance),
    });
  });

  return moves;
}

/**
 * Aplikuje ťah na stav. Vracia NOVÝ stav (pôvodný sa nemení),
 * aby sa dal stav jednoducho porovnávať v testoch a neskôr posielať po sieti.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const pieces = state.pieces.map((p) => ({ ...p, location: { ...p.location } as PieceLocation }));
  pieces[move.pieceIndex].location = { ...move.to } as PieceLocation;
  if (move.capturesPieceIndex !== null) {
    pieces[move.capturesPieceIndex].location = { kind: 'yard' };
  }
  return { ...state, pieces };
}

/**
 * Koľko hodov má hráč v tomto ťahu k dispozícii.
 * Ak nemá žiadnu figúrku na dráhe (a teda nemôže ťahať bez šestky), má 3 pokusy.
 */
export function rollsAllowed(state: GameState, player: PlayerIndex): number {
  return hasPieceOnTrack(state, player) ? 1 : 3;
}
