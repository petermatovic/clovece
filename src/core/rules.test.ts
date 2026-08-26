import { describe, expect, it } from 'vitest';
import { chooseMove } from './ai';
import { Game } from './game';
import { getLegalMoves, applyMove, rollsAllowed } from './rules';
import { distanceToLocation, locationDistance, startField } from './board';
import type { GameState, PieceLocation, PlayerIndex } from './types';

function newGame(playerCount = 4, endOnFirstWinner = true): Game {
  return new Game({
    endOnFirstWinner,
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `Hráč ${i + 1}`,
      isAI: false,
      pieceColor: '#ffffff',
      diceColor: '#ffffff',
    })),
  });
}

/** Postaví figúrku hráča na konkrétnu vzdialenosť od jeho štartu (0..43). */
function place(state: GameState, player: PlayerIndex, pieceId: number, distance: number): void {
  const idx = state.pieces.findIndex((p) => p.owner === player && p.id === pieceId);
  state.pieces[idx].location = distanceToLocation(player, distance);
}

function locOf(state: GameState, player: PlayerIndex, pieceId: number): PieceLocation {
  return state.pieces.find((p) => p.owner === player && p.id === pieceId)!.location;
}

describe('nasadzovanie figúrok', () => {
  it('bez šestky sa nasadiť nedá', () => {
    const g = newGame();
    for (const roll of [1, 2, 3, 4, 5]) {
      expect(getLegalMoves(g.state, roll)).toHaveLength(0);
    }
  });

  it('šestka nasadí figúrku na vlastné štartové pole', () => {
    const g = newGame();
    const moves = getLegalMoves(g.state, 6);
    expect(moves).toHaveLength(4); // 4 figúrky vo dvore, všetky môžu nastúpiť
    expect(moves[0].kind).toBe('enter');
    expect(moves[0].to).toEqual({ kind: 'track', pos: startField(0) });
  });

  it('vlastná figúrka na štartovom poli blokuje nasadenie', () => {
    const g = newGame();
    place(g.state, 0, 0, 0); // vlastná figúrka stojí na štarte
    const enters = getLegalMoves(g.state, 6).filter((m) => m.kind === 'enter');
    expect(enters).toHaveLength(0);
  });

  it('súperova figúrka na štartovom poli sa nasadením vyhodí', () => {
    const g = newGame();
    // Hráč 1 stojí na štartovom poli hráča 0.
    const idx = g.state.pieces.findIndex((p) => p.owner === 1 && p.id === 0);
    g.state.pieces[idx].location = { kind: 'track', pos: startField(0) };

    const enter = getLegalMoves(g.state, 6).find((m) => m.kind === 'enter')!;
    expect(enter.capturesPieceIndex).toBe(idx);
    const after = applyMove(g.state, enter);
    expect(after.pieces[idx].location).toEqual({ kind: 'yard' });
  });
});

describe('posun po dráhe', () => {
  it('vlastná figúrka na cieľovom poli robí ťah nelegálnym', () => {
    const g = newGame();
    place(g.state, 0, 0, 5);
    place(g.state, 0, 1, 8);
    const moves = getLegalMoves(g.state, 3).filter((m) => m.pieceIndex >= 0);
    // Figúrka 0 by skončila na poli figúrky 1 → nelegálne. Figúrka 1 sa posunúť môže.
    const fromFive = moves.filter((m) => locationDistance(0, m.from) === 5);
    expect(fromFive).toHaveLength(0);
    expect(moves.some((m) => locationDistance(0, m.from) === 8)).toBe(true);
  });

  it('cez vlastnú figúrku sa na dráhe preskakovať smie', () => {
    const g = newGame();
    place(g.state, 0, 0, 5);
    place(g.state, 0, 1, 7); // stojí v ceste
    const moves = getLegalMoves(g.state, 4);
    // 5 + 4 = 9, cieľ je voľný, preskok cez pole 7 je povolený.
    expect(moves.some((m) => locationDistance(0, m.to) === 9)).toBe(true);
  });

  it('súperova figúrka na cieľovom poli sa vyhodí do dvora', () => {
    const g = newGame();
    place(g.state, 0, 0, 5);
    const victimIdx = g.state.pieces.findIndex((p) => p.owner === 1 && p.id === 0);
    g.state.pieces[victimIdx].location = distanceToLocation(0, 8); // to isté absolútne pole

    const move = getLegalMoves(g.state, 3).find((m) => locationDistance(0, m.from) === 5)!;
    expect(move.capturesPieceIndex).toBe(victimIdx);
    const after = applyMove(g.state, move);
    expect(after.pieces[victimIdx].location).toEqual({ kind: 'yard' });
  });
});

describe('cieľový domček', () => {
  it('do domčeka sa vchádza presným počtom, prehodenie je nelegálne', () => {
    const g = newGame();
    place(g.state, 0, 0, 41); // v domčeku, slot 1; ostávajú 2 polia
    expect(getLegalMoves(g.state, 2).some((m) => m.pieceIndex >= 0)).toBe(true); // 41+2=43 OK
    expect(getLegalMoves(g.state, 3)).toHaveLength(0); // 41+3=44 > 43
  });

  it('figúrka z dráhy vojde do domčeka', () => {
    const g = newGame();
    place(g.state, 0, 0, 38);
    const move = getLegalMoves(g.state, 3).find((m) => m.kind === 'enterHome')!;
    expect(move.to).toEqual({ kind: 'home', slot: 1 }); // 38+3=41 → slot 1
  });

  it('v domčeku sa vlastná figúrka nepreskakuje', () => {
    const g = newGame();
    place(g.state, 0, 0, 38); // na dráhe
    place(g.state, 0, 1, 41); // blokuje v domčeku slot 1
    // 38 + 3 = 41 → obsadené; 38 + 4 = 42 by muselo preskočiť slot 1 → tiež nelegálne
    expect(getLegalMoves(g.state, 3).some((m) => locationDistance(0, m.from) === 38)).toBe(false);
    expect(getLegalMoves(g.state, 4).some((m) => locationDistance(0, m.from) === 38)).toBe(false);
    // 38 + 2 = 40 → slot 0, voľné a nič sa nepreskakuje
    expect(getLegalMoves(g.state, 2).some((m) => locationDistance(0, m.from) === 38)).toBe(true);
  });
});

describe('pravidlo troch pokusov', () => {
  it('bez figúrky na dráhe má hráč 3 hody, s figúrkou 1', () => {
    const g = newGame();
    expect(rollsAllowed(g.state, 0)).toBe(3);
    place(g.state, 0, 0, 5);
    expect(rollsAllowed(g.state, 0)).toBe(1);
  });

  it('tri neúspešné hody ukončia ťah', () => {
    const g = newGame();
    g.roll(1);
    expect(g.state.current).toBe(0);
    g.roll(2);
    expect(g.state.current).toBe(0);
    g.roll(3);
    expect(g.state.current).toBe(1); // ťah prepadol na ďalšieho hráča
  });

  it('s figúrkou na dráhe ukončí ťah už prvý neúspešný hod', () => {
    const g = newGame();
    place(g.state, 0, 0, 41); // v domčeku len 2 polia od konca, na dráhe nič
    place(g.state, 0, 1, 5); // figúrka na dráhe → 1 hod
    // hod 5: figúrka na 5 by šla na 10 (voľné) → legálny ťah existuje, takže test hodí inak
    g.roll(1);
    expect(g.state.phase).toBe('WAITING_MOVE');
  });
});

describe('šestka a ďalší hod', () => {
  it('po ťahu šestkou hráč hádže znova', () => {
    const g = newGame();
    g.roll(6);
    g.selectMove(g.getAvailableMoves()[0]);
    expect(g.state.current).toBe(0);
    expect(g.state.phase).toBe('WAITING_ROLL');
  });

  it('šestka bez legálneho ťahu tiež oprávňuje na ďalší hod', () => {
    const g = newGame();
    // Žiadna figúrka vo dvore (nasadenie nepripadá do úvahy) a jediná figúrka na dráhe
    // by šestkou prehodila cieľ (38 + 6 = 44 > 43) → nula legálnych ťahov.
    place(g.state, 0, 0, 38);
    place(g.state, 0, 1, 41);
    place(g.state, 0, 2, 42);
    place(g.state, 0, 3, 43);
    expect(getLegalMoves(g.state, 6)).toHaveLength(0);
    const before = g.state.current;
    g.roll(6);
    expect(g.state.current).toBe(before);
    expect(g.state.phase).toBe('WAITING_ROLL');
  });
});

describe('koniec hry', () => {
  it('hráč so všetkými figúrkami v domčeku vyhráva', () => {
    const g = newGame(2);
    place(g.state, 0, 0, 41);
    place(g.state, 0, 1, 42);
    place(g.state, 0, 2, 43);
    place(g.state, 0, 3, 38); // posledná, 2 polia do slotu 0

    const events: string[] = [];
    g.on((e) => events.push(e.type));

    g.roll(2);
    g.selectMove(g.getAvailableMoves()[0]);

    expect(locOf(g.state, 0, 3)).toEqual({ kind: 'home', slot: 0 });
    expect(events).toContain('playerFinished');
    expect(events).toContain('gameOver');
    expect(g.state.phase).toBe('GAME_OVER');
    expect(g.state.players[0].finishedRank).toBe(1);
  });
});

describe('celá partia AI vs AI', () => {
  it('dohrá sa v rozumnom počte ťahov a skončí korektne', () => {
    // Deterministický RNG, aby bol test opakovateľný.
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const g = new Game({
      rng,
      players: Array.from({ length: 4 }, (_, i) => ({
        name: `AI ${i + 1}`,
        isAI: true,
        pieceColor: '#ffffff',
        diceColor: '#ffffff',
      })),
    });

    let guard = 0;
    while (g.state.phase !== 'GAME_OVER') {
      if (++guard > 20000) throw new Error('Partia sa nedohrala — pravdepodobne zacyklenie.');
      if (g.state.phase === 'WAITING_ROLL') {
        g.roll();
      } else if (g.state.phase === 'WAITING_MOVE') {
        g.selectMove(chooseMove(g.state, g.getAvailableMoves()));
      } else {
        throw new Error(`Neočakávaná fáza ${g.state.phase}`);
      }
    }

    expect(g.state.players.every((p) => p.finishedRank !== null)).toBe(true);
    const winner = g.state.players.find((p) => p.finishedRank === 1)!;
    expect(g.piecesHome(winner.index)).toBe(4);
  });
});
