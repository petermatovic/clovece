/**
 * Stavový automat partie + event emitter.
 *
 * Renderer, audio a UI sú len poslucháči — jadro o nich nevie.
 * Vďaka tomu sa dá celá partia odohrať headless (testy, AI vs AI simulácia).
 *
 * Tok jedného ťahu:
 *   turnStarted → roll() → diceRolled
 *     ├─ existujú legálne ťahy  → WAITING_MOVE → selectMove() → moveApplied
 *     └─ žiadne legálne ťahy    → noLegalMoves
 *   Po šestke hráč pokračuje ďalším hodom. Ak nemá figúrku na dráhe, má 3 pokusy.
 */

import { PIECES_PER_PLAYER } from './board';
import {
  applyMove,
  createInitialPieces,
  getLegalMoves,
  hasPlayerFinished,
  rollsAllowed,
} from './rules';
import type { GameEvent, GameState, Move, Phase, Player, PlayerIndex } from './types';

export interface GameOptions {
  players: Array<Pick<Player, 'name' | 'isAI' | 'pieceColor' | 'diceColor'>>;
  /** Injektovateľný generátor pre testy a pre prepojenie s fyzickou 3D kockou. */
  rng?: () => number;
  /** true = partia končí prvým víťazom; false = hrá sa o všetky miesta. */
  endOnFirstWinner?: boolean;
}

type Listener = (event: GameEvent) => void;

export class Game {
  state: GameState;
  private listeners: Listener[] = [];
  private rng: () => number;
  private endOnFirstWinner: boolean;
  /** Legálne ťahy pre aktuálny hod; prázdne mimo fázy WAITING_MOVE. */
  private currentMoves: Move[] = [];

  constructor(options: GameOptions) {
    const { players, rng = Math.random, endOnFirstWinner = true } = options;
    if (players.length < 2 || players.length > 4) {
      throw new RangeError('Hra je pre 2 až 4 hráčov.');
    }
    this.rng = rng;
    this.endOnFirstWinner = endOnFirstWinner;
    this.state = {
      players: players.map((p, i) => ({ ...p, index: i as PlayerIndex, finishedRank: null })),
      pieces: createInitialPieces(players.length),
      current: 0,
      phase: 'WAITING_ROLL',
      lastRoll: null,
      rollsThisTurn: 0,
      finishedCount: 0,
      turnCounter: 1,
    };
  }

  /**
   * Obnoví hru z uloženého stavu (localStorage).
   * Stav je čistý JSON, takže netreba žiadnu konverziu — len ho dosadiť.
   */
  static restore(state: GameState, options: Omit<GameOptions, 'players'>): Game {
    const game = new Game({
      ...options,
      players: state.players.map((p) => ({
        name: p.name,
        isAI: p.isAI,
        pieceColor: p.pieceColor,
        diceColor: p.diceColor,
      })),
    });
    game.state = state;
    // Rozohraný stav sa vždy obnovuje na začiatku ťahu — priebeh hodu/animácie
    // sa neukladá, takže by po obnove nebolo z čoho pokračovať.
    game.state.phase = 'WAITING_ROLL';
    game.state.lastRoll = null;
    game.state.rollsThisTurn = 0;
    game.currentMoves = [];
    return game;
  }

  // --- Eventy -------------------------------------------------------------

  on(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private setPhase(phase: Phase): void {
    if (this.state.phase === phase) return;
    this.state.phase = phase;
    this.emit({ type: 'phaseChanged', phase });
  }

  // --- Verejné API --------------------------------------------------------

  /** Ťahy dostupné po poslednom hode. Kópia, aby si ju volajúci nemohol prepísať. */
  getAvailableMoves(): Move[] {
    return [...this.currentMoves];
  }

  /** Koľko hodov má aktuálny hráč v tomto ťahu celkovo k dispozícii (1 alebo 3). */
  getRollsAllowed(): number {
    return rollsAllowed(this.state, this.state.current);
  }

  /**
   * Hodí kockou. `forcedValue` umožňuje dodať výsledok z fyzikálnej 3D kocky
   * alebo z testu; bez neho sa použije `rng`.
   */
  roll(forcedValue?: number): number {
    if (this.state.phase !== 'WAITING_ROLL') {
      throw new Error(`Hod nie je možný vo fáze ${this.state.phase}.`);
    }
    const value =
      forcedValue !== undefined ? forcedValue : 1 + Math.floor(this.rng() * 6);
    if (value < 1 || value > 6 || !Number.isInteger(value)) {
      throw new RangeError(`Neplatná hodnota kocky: ${value}`);
    }

    this.state.lastRoll = value;
    this.state.rollsThisTurn += 1;
    this.emit({
      type: 'diceRolled',
      player: this.state.current,
      value,
      rollsThisTurn: this.state.rollsThisTurn,
    });

    this.currentMoves = getLegalMoves(this.state, value);
    if (this.currentMoves.length > 0) {
      this.setPhase('WAITING_MOVE');
      return value;
    }

    this.emit({ type: 'noLegalMoves', player: this.state.current, value });
    // Šestka oprávňuje na ďalší hod aj vtedy, keď sa ňou nedalo ťahať.
    // Bez figúrky na dráhe má hráč 3 pokusy hodiť šestku.
    if (value === 6 || this.state.rollsThisTurn < this.getRollsAllowed()) {
      this.setPhase('WAITING_ROLL');
    } else {
      this.endTurn();
    }
    return value;
  }

  /** Vykoná zvolený ťah. `move` musí pochádzať z `getAvailableMoves()`. */
  selectMove(move: Move): void {
    if (this.state.phase !== 'WAITING_MOVE') {
      throw new Error(`Ťah nie je možný vo fáze ${this.state.phase}.`);
    }
    const isOffered = this.currentMoves.some(
      (m) =>
        m.pieceIndex === move.pieceIndex &&
        m.to.kind === move.to.kind &&
        JSON.stringify(m.to) === JSON.stringify(move.to),
    );
    if (!isOffered) throw new Error('Zvolený ťah nie je medzi legálnymi ťahmi.');

    const mover = this.state.current;
    const captured = move.capturesPieceIndex;
    const victim = captured !== null ? this.state.pieces[captured].owner : null;

    this.state = applyMove(this.state, move);
    this.currentMoves = [];
    this.emit({ type: 'moveApplied', player: mover, move });

    if (captured !== null && victim !== null) {
      this.emit({ type: 'pieceCaptured', victim, pieceIndex: captured, by: mover });
    }
    if (move.to.kind === 'home') {
      this.emit({ type: 'pieceReachedHome', player: mover, pieceIndex: move.pieceIndex });
    }

    if (this.checkPlayerFinished(mover)) return;

    // Po šestke hráč pokračuje ďalším hodom.
    if (this.state.lastRoll === 6) {
      this.state.rollsThisTurn = 0;
      this.setPhase('WAITING_ROLL');
    } else {
      this.endTurn();
    }
  }

  // --- Vnútorné -----------------------------------------------------------

  /** Vracia true, ak sa hra týmto ťahom skončila (volajúci už nemá pokračovať). */
  private checkPlayerFinished(player: PlayerIndex): boolean {
    if (this.state.players[player].finishedRank !== null) return false;
    if (!hasPlayerFinished(this.state, player)) return false;

    this.state.finishedCount += 1;
    const rank = this.state.finishedCount;
    this.state.players[player].finishedRank = rank;
    this.emit({ type: 'playerFinished', player, rank });

    const stillPlaying = this.state.players.filter((p) => p.finishedRank === null).length;
    if (this.endOnFirstWinner || stillPlaying <= 1) {
      this.finishGame();
      return true;
    }
    this.endTurn();
    return true;
  }

  private finishGame(): void {
    // Doplní poradie hráčom, ktorí nedohrali, podľa počtu figúrok v domčeku.
    const unfinished = this.state.players
      .filter((p) => p.finishedRank === null)
      .sort((a, b) => this.homeCount(b.index) - this.homeCount(a.index));
    for (const p of unfinished) {
      this.state.finishedCount += 1;
      p.finishedRank = this.state.finishedCount;
    }
    const ranking = [...this.state.players]
      .sort((a, b) => (a.finishedRank ?? 0) - (b.finishedRank ?? 0))
      .map((p) => p.index);
    this.setPhase('GAME_OVER');
    this.emit({ type: 'gameOver', ranking });
  }

  private homeCount(player: PlayerIndex): number {
    return this.state.pieces.filter((p) => p.owner === player && p.location.kind === 'home')
      .length;
  }

  private endTurn(): void {
    const count = this.state.players.length;
    let next = this.state.current;
    // Preskočí hráčov, ktorí už dohrali.
    for (let i = 1; i <= count; i++) {
      const candidate = ((this.state.current + i) % count) as PlayerIndex;
      if (this.state.players[candidate].finishedRank === null) {
        next = candidate;
        break;
      }
    }
    this.state.current = next;
    this.state.lastRoll = null;
    this.state.rollsThisTurn = 0;
    this.state.turnCounter += 1;
    this.currentMoves = [];
    this.setPhase('WAITING_ROLL');
    this.emit({ type: 'turnStarted', player: next });
  }

  /** Pomôcka pre UI: koľko figúrok hráča je v domčeku (0..4). */
  piecesHome(player: PlayerIndex): number {
    return this.homeCount(player);
  }

  /** Pomôcka pre UI: koľko figúrok hráča je ešte vo dvore. */
  piecesInYard(player: PlayerIndex): number {
    return this.state.pieces.filter((p) => p.owner === player && p.location.kind === 'yard')
      .length;
  }

  /** Celkový počet figúrok na hráča — re-export pre UI vrstvu. */
  static readonly piecesPerPlayer = PIECES_PER_PLAYER;
}
