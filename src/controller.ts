/**
 * Kontrolér — jediné miesto, kde sa stretávajú všetky vrstvy.
 *
 * Herné jadro emituje udalosti okamžite (stav sa zmení hneď), ale vizuál musí
 * bežať postupne. Preto sa z udalostí plnia animácie do fronty a UI sa
 * aktualizuje až vtedy, keď je fronta prázdna a kocka dorolovala.
 */

import { AudioManager } from './audio/audioManager';
import { AI_THINK_MS, HOP_SECONDS, colorByHex, colorById } from './config';
import { chooseMove } from './core/ai';
import { Game } from './core/game';
import type { GameEvent, Move, PlayerIndex } from './core/types';
import { Animator, hopTo } from './render/animator';
import { BOARD_TOP, buildBoard, type BoardBuildResult } from './render/boardBuilder';
import { Dice } from './render/dice';
import { Effects } from './render/effects';
import { locationToWorld, playerCameraAngle } from './render/layout';
import { PieceFactory, pulseSelectable, setPieceSelectable, type PieceView } from './render/pieces';
import { SceneContext } from './render/scene';
import { getTheme, type ThemeId } from './render/themes';
import { UI } from './ui/screens';
import { clearSave, loadGame, saveGame, type PlayerSetup } from './ui/storage';
import { Group, Raycaster, Vector2, Vector3 } from 'three';

/** Výška oblúka pri bežnom skoku o jedno pole. */
const HOP_HEIGHT = 0.45;
/** Výška oblúka, keď vyhodená figúrka letí späť do dvora. */
const CAPTURE_ARC = 2.6;

export class Controller {
  /** Verejné kvôli ladeniu v dev konzole (window.game). */
  readonly scene: SceneContext;
  private ui: UI;
  private audio = new AudioManager();
  private animator = new Animator();
  private effects: Effects;
  private raycaster = new Raycaster();

  game: Game | null = null;
  private themeId: ThemeId = 'wood';
  private board: BoardBuildResult | null = null;
  private pieceFactory: PieceFactory | null = null;
  private pieceViews: PieceView[] = [];
  private pieceGroup = new Group();
  private dice: Dice;

  /** Ťahy, na ktoré sa dá práve kliknúť (mapované na 3D figúrky). */
  private selectableMoves = new Map<number, Move>();
  /** Zabraňuje viacnásobnému naplánovaniu AI ťahu v jednom okamihu. */
  private aiTimer: number | null = null;
  private endShown = false;
  private paused = false;
  private lastFrame = performance.now();
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new SceneContext(canvas);
    this.effects = new Effects(this.scene.scene);
    this.scene.scene.add(this.pieceGroup);
    this.dice = new Dice(this.scene.scene, BOARD_TOP);

    this.ui = new UI(
      {
        onStartGame: (players, themeId) => this.startGame(players, themeId),
        onContinue: () => this.continueGame(),
        onRoll: () => this.handleRollClick(),
        onQuit: () => this.quitToMenu(),
        onRematch: () => this.rematch(),
        onPause: () => this.pause(),
        onResume: () => this.resume(),
        onSettingsChanged: () => this.applySettings(),
      },
      this.audio,
    );

    this.applySettings();
    // Menu má za sebou ukážkovú dosku, aby appka nebola po spustení prázdna.
    this.showMenuBackdrop();
    this.ui.show('menu');

    window.addEventListener('resize', () => this.scene.resize());
    canvas.addEventListener('pointerdown', (e) => this.handleCanvasClick(e));

    requestAnimationFrame(() => this.loop());
  }

  // --- Nastavenia ---------------------------------------------------------

  private applySettings(): void {
    const settings = this.ui.settings;
    this.scene.setShadowQuality(settings.shadowQuality);
    this.animator.speed = settings.animationSpeed;
  }

  // --- Životný cyklus partie ---------------------------------------------

  /** Doska bez figúrok ako pozadie hlavného menu. */
  private showMenuBackdrop(): void {
    this.themeId = this.ui.settings.themeId;
    this.buildWorld(this.ui.getActivePlayers().map((p) => colorById(p.pieceColorId).hex));
    this.scene.snapTo(playerCameraAngle(0), 19, 16);
  }

  private buildWorld(playerColors: string[]): void {
    const theme = getTheme(this.themeId);
    this.scene.applyTheme(theme);

    this.board?.dispose();
    this.board = buildBoard(theme, playerColors);
    this.scene.scene.add(this.board.group);

    this.pieceFactory?.dispose();
    this.pieceFactory = new PieceFactory(theme);
  }

  private startGame(setups: PlayerSetup[], themeId: ThemeId): void {
    this.themeId = themeId;
    clearSave();
    const game = new Game({
      players: setups.map((s) => ({
        name: s.name,
        isAI: s.isAI,
        pieceColor: colorById(s.pieceColorId).hex,
        diceColor: colorById(s.diceColorId).hex,
      })),
    });
    this.attachGame(game);
  }

  private continueGame(): void {
    const saved = loadGame();
    if (!saved) {
      this.ui.refreshContinueButton();
      return;
    }
    this.themeId = saved.themeId;
    this.attachGame(Game.restore(saved.state, {}));
  }

  private rematch(): void {
    const previous = this.game;
    if (!previous) {
      this.ui.show('setup');
      return;
    }
    const players = previous.state.players.map((p) => ({
      name: p.name,
      isAI: p.isAI,
      pieceColor: p.pieceColor,
      diceColor: p.diceColor,
    }));
    this.attachGame(new Game({ players }));
  }

  private attachGame(game: Game): void {
    this.cancelAiTimer();
    this.animator.clear();
    this.effects.clear();
    this.endShown = false;
    this.paused = false;
    this.game = game;
    this.ui.clearLog();

    this.buildWorld(game.state.players.map((p) => p.pieceColor));
    this.rebuildPieces();

    game.on((event) => this.handleGameEvent(event));

    this.dice.reset();
    this.setDiceColorFor(game.state.current);
    this.scene.snapTo(playerCameraAngle(game.state.current), 17, 15);
    this.ui.showGame();
    this.ui.log(`Začína ${game.state.players[game.state.current].name}.`);
    this.syncUi();
    this.persist();
  }

  private quitToMenu(): void {
    this.cancelAiTimer();
    this.animator.clear();
    this.effects.clear();
    // Rozohraná partia sa zámerne NEMAŽE — hráč sa k nej vie vrátiť cez „Pokračovať".
    if (this.game && this.game.state.phase !== 'GAME_OVER') this.persist();
    this.game = null;
    this.clearPieces();
    this.ui.refreshContinueButton();
    this.showMenuBackdrop();
    this.ui.show('menu');
  }

  private pause(): void {
    this.paused = true;
    this.cancelAiTimer();
    this.ui.show('pause');
  }

  private resume(): void {
    this.paused = false;
    this.ui.showGame();
  }

  private persist(): void {
    if (!this.game) return;
    if (this.game.state.phase === 'GAME_OVER') {
      clearSave();
      return;
    }
    saveGame(this.game.state, this.themeId);
  }

  // --- Figúrky ------------------------------------------------------------

  private clearPieces(): void {
    this.pieceGroup.clear();
    this.pieceViews = [];
    this.selectableMoves.clear();
  }

  private rebuildPieces(): void {
    if (!this.game || !this.pieceFactory) return;
    this.clearPieces();
    this.game.state.pieces.forEach((piece, index) => {
      const color = this.game!.state.players[piece.owner].pieceColor;
      const view = this.pieceFactory!.create(piece, index, color);
      view.group.userData.baseY = view.group.position.y;
      this.pieceGroup.add(view.group);
      this.pieceViews.push(view);
    });
  }

  private viewOf(stateIndex: number): PieceView {
    return this.pieceViews[stateIndex];
  }

  private worldOf(stateIndex: number): Vector3 {
    const piece = this.game!.state.pieces[stateIndex];
    return locationToWorld(piece.owner, piece.location, piece.id, BOARD_TOP + 0.015);
  }

  // --- Udalosti herného jadra --------------------------------------------

  private handleGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'diceRolled':
        this.ui.log(`${this.playerName(event.player)} hodil ${event.value}.`);
        break;

      case 'noLegalMoves':
        this.animator.then(() => {
          this.audio.play('skip');
          this.ui.log(`${this.playerName(event.player)} nemá ťah.`);
        });
        break;

      case 'moveApplied':
        this.queueMoveAnimation(event.move, event.player);
        break;

      case 'pieceCaptured':
        this.queueCaptureAnimation(event.pieceIndex, event.victim);
        break;

      case 'pieceReachedHome':
        this.animator.then(() => {
          this.audio.play('home');
          this.effects.sparkle(this.worldOf(event.pieceIndex));
          this.ui.log(`${this.playerName(event.player)} má figúrku v domčeku!`);
        });
        break;

      case 'playerFinished':
        this.animator.then(() => {
          this.ui.log(`${this.playerName(event.player)} dohral na ${event.rank}. mieste.`);
        });
        break;

      case 'gameOver':
        this.animator.wait(0.5);
        this.animator.then(() => this.showEnd(event.ranking));
        break;

      default:
        break;
    }
  }

  private playerName(player: PlayerIndex): string {
    return this.game?.state.players[player].name ?? '';
  }

  /** Skok figúrky pole po poli podľa `move.path`. */
  private queueMoveAnimation(move: Move, player: PlayerIndex): void {
    const view = this.viewOf(move.pieceIndex);
    const color = this.game!.state.players[player].pieceColor;
    const piece = this.game!.state.pieces[move.pieceIndex];

    if (move.kind === 'enter') {
      // Nasadenie: figúrka „doletí" z dvora na štartové pole jedným vysokým oblúkom.
      const to = locationToWorld(player, move.to, piece.id, BOARD_TOP + 0.015);
      hopTo(this.animator, view.group, view.group.position.clone(), to, 0.42, 1.5, () => {
        this.audio.play('enter');
        this.effects.ripple(to, color);
      });
      return;
    }

    let from = view.group.position.clone();
    move.path.forEach((step, index) => {
      const to = locationToWorld(player, step, piece.id, BOARD_TOP + 0.015);
      const isLast = index === move.path.length - 1;
      const target = to.clone();
      hopTo(this.animator, view.group, from.clone(), target, HOP_SECONDS, HOP_HEIGHT, () => {
        this.audio.play('hop');
        if (isLast) this.effects.ripple(target, color);
      });
      from = target;
    });
  }

  /** Vyhodená figúrka letí vysokým oblúkom späť do svojho dvora. */
  private queueCaptureAnimation(pieceIndex: number, victim: PlayerIndex): void {
    const view = this.viewOf(pieceIndex);
    const color = this.game!.state.players[victim].pieceColor;
    this.animator.then(() => {
      const impact = view.group.position.clone();
      this.audio.play('capture');
      this.effects.burst(impact, color);
    });
    const to = this.worldOf(pieceIndex);
    this.animator.push(0, () => {}, () => {
      hopTo(this.animator, view.group, view.group.position.clone(), to, 0.62, CAPTURE_ARC, () => {
        this.effects.ripple(to, color);
      });
    });
  }

  private showEnd(ranking: PlayerIndex[]): void {
    if (this.endShown || !this.game) return;
    this.endShown = true;
    clearSave();
    this.ui.refreshContinueButton();
    this.audio.play('win');
    this.effects.confetti(this.game.state.players.map((p) => p.pieceColor));

    const winner = this.game.state.players[ranking[0]];
    this.ui.showEndScreen(
      `Vyhral ${winner.name}!`,
      ranking.map((index, i) => ({
        name: this.game!.state.players[index].name,
        color: this.game!.state.players[index].pieceColor,
        rank: i + 1,
      })),
    );
  }

  // --- Vstup --------------------------------------------------------------

  private handleRollClick(): void {
    if (!this.game || this.paused) return;
    if (this.game.state.phase !== 'WAITING_ROLL') return;
    if (this.animator.isBusy || this.dice.isRolling) return;
    this.rollDice();
  }

  private rollDice(): void {
    if (!this.game) return;
    this.audio.play('diceRoll');
    this.ui.setRollButton('disabled', null);
    this.dice.roll((value) => {
      this.audio.play('diceLand');
      this.game?.roll(value);
      this.persist();
    });
  }

  private handleCanvasClick(event: PointerEvent): void {
    if (!this.game || this.paused) return;
    if (this.animator.isBusy || this.dice.isRolling) return;
    this.audio.unlock();

    const ndc = this.scene.screenToNdc(event);
    this.raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), this.scene.camera);

    // Klik na kocku = hod (rovnaké ako tlačidlo, len prirodzenejšie).
    if (this.game.state.phase === 'WAITING_ROLL') {
      if (this.raycaster.intersectObject(this.dice.object, false).length > 0) {
        this.rollDice();
      }
      return;
    }

    if (this.game.state.phase !== 'WAITING_MOVE') return;
    const current = this.game.state.current;
    if (this.game.state.players[current].isAI) return;

    const hits = this.raycaster.intersectObjects(this.pieceGroup.children, true);
    if (hits.length === 0) return;
    // Nájde koreňovú skupinu figúrky, na ktorú sa kliklo.
    let node = hits[0].object;
    while (node.parent && node.parent !== this.pieceGroup) node = node.parent;
    const view = this.pieceViews.find((v) => v.group === node);
    if (!view) return;

    const move = this.selectableMoves.get(view.stateIndex);
    if (!move) return;
    this.applyMove(move);
  }

  private applyMove(move: Move): void {
    if (!this.game) return;
    this.clearSelectable();
    this.game.selectMove(move);
    this.persist();
  }

  private clearSelectable(): void {
    this.selectableMoves.clear();
    for (const view of this.pieceViews) setPieceSelectable(view, false);
  }

  // --- Synchronizácia UI + AI --------------------------------------------

  /** Volá sa vždy, keď dobehnú animácie — dovtedy by UI ukazovalo budúcnosť. */
  private syncUi(): void {
    if (!this.game) return;
    const state = this.game.state;
    const player = state.players[state.current];

    this.ui.renderPlayersStrip(
      state.players.map((p) => ({
        name: p.name,
        color: p.pieceColor,
        isAI: p.isAI,
        home: this.game!.piecesHome(p.index),
        active: p.index === state.current && state.phase !== 'GAME_OVER',
        finished: p.finishedRank !== null,
      })),
    );

    if (state.phase === 'GAME_OVER') {
      this.ui.setTurn('Koniec hry', '#888', '');
      this.ui.setRollButton('disabled', null);
      return;
    }

    const rollsLeft = this.game.getRollsAllowed() - state.rollsThisTurn;
    if (state.phase === 'WAITING_ROLL') {
      const hint = player.isAI
        ? 'Počítač hádže…'
        : rollsLeft > 1
          ? `Hoď kockou (${rollsLeft} pokusy)`
          : 'Hoď kockou';
      this.ui.setTurn(player.name, player.pieceColor, hint);
      this.ui.setRollButton(player.isAI ? 'disabled' : 'roll', state.lastRoll);
      this.setDiceColorFor(state.current);
    } else if (state.phase === 'WAITING_MOVE') {
      this.ui.setTurn(
        player.name,
        player.pieceColor,
        player.isAI ? 'Počítač ťahá…' : 'Vyber figúrku',
      );
      this.ui.setRollButton('pick', state.lastRoll);
    }
  }

  private setDiceColorFor(player: PlayerIndex): void {
    if (!this.game) return;
    const hex = this.game.state.players[player].diceColor;
    // Kontrastná farba bodiek sa berie z palety podľa hex hodnoty kocky.
    this.dice.setColors(hex, colorByHex(hex).pip);
  }

  /** Rozhodne, čo sa má stať, keď je scéna v pokoji. */
  private advance(): void {
    if (!this.game || this.paused || this.endShown) return;
    if (this.animator.isBusy || this.dice.isRolling || this.aiTimer !== null) return;

    const state = this.game.state;
    if (state.phase === 'GAME_OVER') return;

    const player = state.players[state.current];

    if (state.phase === 'WAITING_ROLL') {
      if (player.isAI) this.scheduleAi(() => this.rollDice());
      return;
    }

    if (state.phase === 'WAITING_MOVE') {
      const moves = this.game.getAvailableMoves();
      if (moves.length === 0) return;

      if (player.isAI) {
        this.scheduleAi(() => this.applyMove(chooseMove(state, moves)));
        return;
      }

      if (this.ui.settings.autoSingleMove && moves.length === 1) {
        this.scheduleAi(() => this.applyMove(moves[0]), 320);
        return;
      }

      // Zvýrazní figúrky, na ktoré sa dá kliknúť.
      if (this.selectableMoves.size === 0) {
        for (const move of moves) {
          // Ak má figúrka viac možností, ponechá sa prvá — pri tomto pravidlovom
          // variante je pre jednu figúrku pri jednom hode vždy najviac jeden ťah.
          if (!this.selectableMoves.has(move.pieceIndex)) {
            this.selectableMoves.set(move.pieceIndex, move);
            setPieceSelectable(this.viewOf(move.pieceIndex), true);
          }
        }
      }
    }
  }

  private scheduleAi(action: () => void, delay = AI_THINK_MS): void {
    this.aiTimer = window.setTimeout(() => {
      this.aiTimer = null;
      action();
    }, delay / Math.max(0.5, this.animator.speed));
  }

  private cancelAiTimer(): void {
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }

  // --- Slučka -------------------------------------------------------------

  private loop(): void {
    const now = performance.now();
    // Clamp — po prepnutí karty by inak delta bola niekoľko sekúnd a fyzika by explodovala.
    const delta = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += delta;

    this.animator.update(delta);
    this.dice.update(delta);
    this.effects.update(delta);
    pulseSelectable(this.pieceViews, this.elapsed);

    if (!this.animator.isBusy && !this.dice.isRolling) {
      this.syncUi();
      this.followCurrentPlayer();
      this.advance();
    }

    this.scene.render();
    requestAnimationFrame(() => this.loop());
  }

  private lastCameraPlayer: PlayerIndex | null = null;

  private followCurrentPlayer(): void {
    if (!this.game || !this.ui.settings.rotateCamera) return;
    if (this.game.state.phase === 'GAME_OVER') return;
    const current = this.game.state.current;
    if (this.lastCameraPlayer === current) return;
    this.lastCameraPlayer = current;
    this.scene.orbitTo(playerCameraAngle(current));
  }
}
