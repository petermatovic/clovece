/**
 * Čisté typy herného jadra. Žiadna väzba na DOM ani Three.js —
 * jadro musí byť testovateľné headless a neskôr použiteľné na serveri (online režim).
 */

/** Index hráča 0..3. Zároveň určuje geometriu: štartové pole = p * FIELDS_PER_PLAYER. */
export type PlayerIndex = 0 | 1 | 2 | 3;

/** Kde sa figúrka nachádza. */
export type PieceLocation =
  /** V štartovom dvore (ešte nenasadená). */
  | { kind: 'yard' }
  /** Na hlavnej dráhe, `pos` je absolútny index 0..39. */
  | { kind: 'track'; pos: number }
  /** V cieľovom domčeku, `slot` je 0..3 (0 = najbližší k vstupu). */
  | { kind: 'home'; slot: number };

export interface Piece {
  /** Stabilné id v rámci hráča: 0..3. */
  id: number;
  owner: PlayerIndex;
  location: PieceLocation;
}

export interface Player {
  index: PlayerIndex;
  name: string;
  isAI: boolean;
  /** Hex farba figúrok, napr. '#e23b3b'. */
  pieceColor: string;
  /** Hex farba kocky (telo). */
  diceColor: string;
  /** Poradie dohrania (1 = prvý, kto dostal všetky figúrky domov); null = ešte hrá. */
  finishedRank: number | null;
}

/** Fáza herného automatu. */
export type Phase =
  /** Čaká sa na hod kockou (klik hráča alebo AI). */
  | 'WAITING_ROLL'
  /** Kocka letí — animácia beží, vstup zablokovaný. */
  | 'ROLLING'
  /** Hod padol, čaká sa na výber figúrky. */
  | 'WAITING_MOVE'
  /** Prebieha animácia ťahu. */
  | 'ANIMATING'
  /** Hra skončila. */
  | 'GAME_OVER';

export interface GameState {
  players: Player[];
  pieces: Piece[];
  current: PlayerIndex;
  phase: Phase;
  /** Posledná hodnota kocky, null pred prvým hodom v ťahu. */
  lastRoll: number | null;
  /**
   * Koľký hod v rámci aktuálneho ťahu to je (1-based).
   * Používa sa na pravidlo „3 pokusy", keď hráč nemá figúrku na dráhe.
   */
  rollsThisTurn: number;
  /** Poradie dohrania — koľko hráčov už skončilo. */
  finishedCount: number;
  /** Prírastkové číslo ťahu, pre logovanie a debug. */
  turnCounter: number;
}

/** Jeden legálny ťah, ktorý vie hráč/AI vykonať. */
export interface Move {
  /** Globálny index figúrky v `GameState.pieces`. */
  pieceIndex: number;
  from: PieceLocation;
  to: PieceLocation;
  /** Typ ťahu — pre animácie a zvuky. */
  kind: 'enter' | 'advance' | 'enterHome' | 'homeAdvance';
  /** Globálny index vyhodenej súperovej figúrky, ak nejaká. */
  capturesPieceIndex: number | null;
  /**
   * Postupnosť polí, cez ktoré figúrka prejde (bez východiskového poľa).
   * Renderer podľa nej animuje skok pole-po-poli.
   */
  path: PieceLocation[];
}

/** Udalosti, na ktoré sa vešia renderer, audio a UI. */
export type GameEvent =
  | { type: 'turnStarted'; player: PlayerIndex }
  | { type: 'diceRolled'; player: PlayerIndex; value: number; rollsThisTurn: number }
  | { type: 'noLegalMoves'; player: PlayerIndex; value: number }
  | { type: 'moveApplied'; player: PlayerIndex; move: Move }
  | { type: 'pieceCaptured'; victim: PlayerIndex; pieceIndex: number; by: PlayerIndex }
  | { type: 'pieceReachedHome'; player: PlayerIndex; pieceIndex: number }
  | { type: 'playerFinished'; player: PlayerIndex; rank: number }
  | { type: 'gameOver'; ranking: PlayerIndex[] }
  | { type: 'phaseChanged'; phase: Phase };
