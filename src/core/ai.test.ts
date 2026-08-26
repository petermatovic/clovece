import { describe, expect, it } from 'vitest';
import { chooseMove } from './ai';
import { distanceToLocation } from './board';
import { Game } from './game';
import { getLegalMoves } from './rules';
import type { GameState, PlayerIndex } from './types';

function newGame(playerCount = 4): Game {
  return new Game({
    players: Array.from({ length: playerCount }, (_, i) => ({
      name: `Hráč ${i + 1}`,
      isAI: true,
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

/** Postaví súperovu figúrku na absolútne pole dráhy. */
function placeOpponentAt(
  state: GameState,
  player: PlayerIndex,
  pieceId: number,
  trackPos: number,
): number {
  const idx = state.pieces.findIndex((p) => p.owner === player && p.id === pieceId);
  state.pieces[idx].location = { kind: 'track', pos: trackPos };
  return idx;
}

describe('AI musí vyhodiť súpera, keď má možnosť', () => {
  it('uprednostní vyhodenie pred dobehnutím vlastnej figúrky do domčeka', () => {
    const g = newGame();
    // Figúrka A je 2 polia pred domčekom → hodom 3 by dobehla do slotu 1.
    place(g.state, 0, 0, 38);
    // Figúrka B je na dráhe a hodom 3 by vyhodila súpera.
    place(g.state, 0, 1, 10);
    const victimIdx = placeOpponentAt(g.state, 1, 0, 13); // absolútne pole 13 = vzdialenosť 13

    const moves = getLegalMoves(g.state, 3);
    // Obe možnosti musia existovať, inak test nič netestuje.
    expect(moves.some((m) => m.to.kind === 'home')).toBe(true);
    expect(moves.some((m) => m.capturesPieceIndex === victimIdx)).toBe(true);

    const chosen = chooseMove(g.state, moves);
    expect(chosen.capturesPieceIndex).toBe(victimIdx);
  });

  it('uprednostní vyhodenie pred nasadením novej figúrky', () => {
    const g = newGame();
    place(g.state, 0, 0, 5);
    // Súper stojí 6 polí pred figúrkou A → hod 6 ho vyhodí.
    const victimIdx = placeOpponentAt(g.state, 1, 0, 11);

    const moves = getLegalMoves(g.state, 6);
    expect(moves.some((m) => m.kind === 'enter')).toBe(true);

    const chosen = chooseMove(g.state, moves);
    expect(chosen.capturesPieceIndex).toBe(victimIdx);
  });

  it('uprednostní vyhodenie aj vtedy, keď tým vstúpi na ohrozené pole', () => {
    const g = newGame();
    place(g.state, 0, 0, 10);
    const victimIdx = placeOpponentAt(g.state, 1, 0, 13);
    // Ďalší súper číha 2 polia za cieľovým poľom → to pole je ohrozené.
    placeOpponentAt(g.state, 2, 0, 11);
    // Bezpečná alternatíva: druhá vlastná figúrka sa môže posunúť inam.
    place(g.state, 0, 1, 20);

    const moves = getLegalMoves(g.state, 3);
    expect(moves.length).toBeGreaterThan(1);

    const chosen = chooseMove(g.state, moves);
    expect(chosen.capturesPieceIndex).toBe(victimIdx);
  });

  it('spomedzi viacerých vyhodení si vyberie toho súpera, ktorý došiel najďalej', () => {
    const g = newGame();
    // Scenár je postavený tak, aby doň nezasahovalo ohrozenie polí — inak by
    // bonus za útek z ohrozeného poľa prebil preferenciu pokročilejšej obete
    // a test by meral niečo iné, než tvrdí.
    place(g.state, 0, 0, 32);
    place(g.state, 0, 1, 22);
    // Súper 1 stojí na poli 35, jeho štart je 10 → prešiel 25 polí, takmer doma.
    const dalsi = placeOpponentAt(g.state, 1, 0, 35);
    // Súper 2 stojí na poli 25, jeho štart je 20 → prešiel len 5 polí.
    const blizsi = placeOpponentAt(g.state, 2, 0, 25);

    const moves = getLegalMoves(g.state, 3);
    const captures = moves.filter((m) => m.capturesPieceIndex !== null);
    expect(captures).toHaveLength(2);

    // Menej pokročilú obeť má AI po ceste bližšie, takže ak by rozhodovala len
    // vzdialenosť vlastnej figúrky, vybrala by práve ju.
    const chosen = chooseMove(g.state, moves);
    expect(chosen.capturesPieceIndex).toBe(dalsi);
    expect(chosen.capturesPieceIndex).not.toBe(blizsi);
  });

  it('bez možnosti vyhodiť sa správa ako predtým — dobehne do domčeka', () => {
    const g = newGame();
    place(g.state, 0, 0, 38); // hodom 3 dobehne do domčeka
    place(g.state, 0, 1, 10); // alternatíva bez vyhodenia

    const chosen = chooseMove(g.state, getLegalMoves(g.state, 3));
    expect(chosen.to.kind).toBe('home');
  });
});
