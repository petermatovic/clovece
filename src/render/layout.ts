/**
 * Prevod hernej topológie na 3D súradnice.
 *
 * Doska je klasický kríž na mriežke 11×11 (indexy 0..10, stred 5,5).
 * Celý layout sa generuje z JEDNÉHO ramena hráča 0 opakovanou rotáciou o 90°,
 * takže sa nikde nehardcoduje 40 polí a nemôže vzniknúť nesúlad s `core/board.ts`.
 *
 * Rotácia o 90° okolo stredu: (x, y) → (10 - y, x)
 */

import { Vector3 } from 'three';
import { FIELDS_PER_PLAYER, HOME_SLOTS, TRACK_LENGTH } from '../core/board';
import type { PieceLocation, PlayerIndex } from '../core/types';

export const GRID_SIZE = 11;
const GRID_CENTER = (GRID_SIZE - 1) / 2; // 5
/** Rozostup polí vo svetových jednotkách. */
export const CELL = 1.0;
/** Výška, v ktorej stoja figúrky nad doskou. */
export const PIECE_Y = 0.12;

export interface GridCell {
  col: number;
  row: number;
}

/** Otočí bunku o 90° v smere hodinových ručičiek okolo stredu mriežky. */
function rotate(cell: GridCell): GridCell {
  return { col: GRID_SIZE - 1 - cell.row, row: cell.col };
}

function rotateTimes(cell: GridCell, times: number): GridCell {
  let out = cell;
  for (let i = 0; i < times; i++) out = rotate(out);
  return out;
}

/**
 * Prvých 10 polí dráhy pre hráča 0: od jeho štartu doľava hore po roh kríža.
 * Zvyšné 3 ramená sú rotácie tohto.
 */
const ARM_0: GridCell[] = [
  { col: 0, row: 4 }, // štartové pole hráča 0
  { col: 1, row: 4 },
  { col: 2, row: 4 },
  { col: 3, row: 4 },
  { col: 4, row: 4 },
  { col: 4, row: 3 },
  { col: 4, row: 2 },
  { col: 4, row: 1 },
  { col: 4, row: 0 },
  { col: 5, row: 0 },
];

/** Domček hráča 0: stredový rad smerom do stredu, slot 0 je najbližšie k vstupu. */
const HOME_0: GridCell[] = [
  { col: 1, row: 5 },
  { col: 2, row: 5 },
  { col: 3, row: 5 },
  { col: 4, row: 5 },
];

/** Štartový dvor hráča 0: 2×2 v ľavom hornom rohu. */
const YARD_0: GridCell[] = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
];

/** Celá dráha 0..39 v mriežkových súradniciach. */
export const TRACK_CELLS: GridCell[] = (() => {
  const cells: GridCell[] = [];
  for (let player = 0; player < 4; player++) {
    for (const cell of ARM_0) cells.push(rotateTimes(cell, player));
  }
  if (cells.length !== TRACK_LENGTH) {
    throw new Error(`Dráha má ${cells.length} polí namiesto ${TRACK_LENGTH}.`);
  }
  return cells;
})();

export const HOME_CELLS: GridCell[][] = Array.from({ length: 4 }, (_, p) =>
  HOME_0.map((c) => rotateTimes(c, p)),
);

export const YARD_CELLS: GridCell[][] = Array.from({ length: 4 }, (_, p) =>
  YARD_0.map((c) => rotateTimes(c, p)),
);

/** Mriežková bunka → svetová pozícia (y je výška, doska leží v rovine XZ). */
export function cellToWorld(cell: GridCell, y = 0): Vector3 {
  return new Vector3((cell.col - GRID_CENTER) * CELL, y, (cell.row - GRID_CENTER) * CELL);
}

/** Pozícia figúrky (herná) → svetová pozícia stredu poľa. */
export function locationToWorld(
  owner: PlayerIndex,
  location: PieceLocation,
  pieceId: number,
  y = PIECE_Y,
): Vector3 {
  switch (location.kind) {
    case 'track':
      return cellToWorld(TRACK_CELLS[location.pos], y);
    case 'home':
      return cellToWorld(HOME_CELLS[owner][location.slot], y);
    case 'yard':
      return cellToWorld(YARD_CELLS[owner][pieceId], y);
  }
}

/** Uhol (v radiánoch) od stredu dosky k štartovému poľu hráča — pre natočenie kamery. */
export function playerCameraAngle(player: PlayerIndex): number {
  const cell = TRACK_CELLS[player * FIELDS_PER_PLAYER];
  const world = cellToWorld(cell);
  return Math.atan2(world.x, world.z);
}

/** Kontrola konzistencie layoutu voči hernému jadru (volané v dev režime). */
export function assertLayoutConsistent(): void {
  if (HOME_CELLS.some((h) => h.length !== HOME_SLOTS)) {
    throw new Error('Počet domčekových polí nesedí s HOME_SLOTS.');
  }
  const seen = new Set(TRACK_CELLS.map((c) => `${c.col},${c.row}`));
  if (seen.size !== TRACK_LENGTH) {
    throw new Error('Dráha obsahuje duplicitné polia — rotácia je zle nastavená.');
  }
}
