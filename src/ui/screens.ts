/**
 * Celá DOM vrstva: obrazovky, nastavenie hráčov, výber plochy, HUD, koniec hry.
 *
 * UI nevie nič o Three.js ani o pravidlách — komunikuje s ostatnými vrstvami
 * výhradne cez callbacky v `UICallbacks` a cez metódy, ktoré volá kontrolér.
 */

import {
  COLOR_OPTIONS,
  DEFAULT_PLAYER_COLORS,
  DEFAULT_PLAYER_NAMES,
  colorById,
} from '../config';
import type { AudioManager } from '../audio/audioManager';
import { HOME_CELLS, TRACK_CELLS, YARD_CELLS } from '../render/layout';
import type { ShadowQuality } from '../render/scene';
import { THEMES, type ThemeId } from '../render/themes';
import type { PlayerSetup, Settings } from './storage';
import { hasSave, loadSettings, saveSettings } from './storage';

export interface UICallbacks {
  onStartGame: (players: PlayerSetup[], themeId: ThemeId) => void;
  onContinue: () => void;
  onRoll: () => void;
  onQuit: () => void;
  onRematch: () => void;
  onPause: () => void;
  onResume: () => void;
  onSettingsChanged: (settings: Settings) => void;
}

const DEFAULT_SETTINGS: Settings = {
  players: DEFAULT_PLAYER_NAMES.slice(0, 4).map((name, i) => ({
    name,
    isAI: i > 0,
    pieceColorId: DEFAULT_PLAYER_COLORS[i],
    diceColorId: DEFAULT_PLAYER_COLORS[i],
  })),
  themeId: 'wood',
  shadowQuality: 'high',
  animationSpeed: 1,
  autoSingleMove: true,
  rotateCamera: true,
};

type ScreenId = 'menu' | 'setup' | 'theme' | 'end' | 'pause' | 'settings' | 'rules' | null;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`V DOM chýba prvok #${id}`);
  return node as T;
}

export class UI {
  settings: Settings;
  /** Koľko slotov je aktívnych (2..4). */
  private playerCount: number;
  /** Kam sa vrátiť po zatvorení nastavení/pravidiel. */
  private returnScreen: ScreenId = 'menu';
  private logLines: string[] = [];

  constructor(
    private callbacks: UICallbacks,
    private audio: AudioManager,
  ) {
    const stored = loadSettings();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      // Sloty musia byť vždy štyri, aj keď sa hrá v menšom počte.
      players: this.normalizePlayers(stored.players),
    };
    this.playerCount = Math.min(4, Math.max(2, stored.players?.length ?? 2));

    this.wireStaticButtons();
    this.buildPlayerCountSelector();
    this.buildThemeCards();
    this.syncSettingsControls();
    this.renderPlayerSlots();
    this.refreshContinueButton();
  }

  private normalizePlayers(players?: PlayerSetup[]): PlayerSetup[] {
    const out = [...DEFAULT_SETTINGS.players];
    players?.forEach((p, i) => {
      if (i < 4) out[i] = { ...out[i], ...p };
    });
    return out;
  }

  // --- Prepínanie obrazoviek ---------------------------------------------

  show(screen: ScreenId): void {
    for (const id of ['menu', 'setup', 'theme', 'end', 'pause', 'settings', 'rules']) {
      el(`screen-${id}`).classList.toggle('hidden', id !== screen);
    }
    el('hud').classList.toggle('hidden', screen !== null);
  }

  showGame(): void {
    this.show(null);
  }

  // --- Statické tlačidlá --------------------------------------------------

  private click(id: string, handler: () => void): void {
    el(id).addEventListener('click', () => {
      // Prvé gesto odomkne zvuk (autoplay policy prehliadačov).
      this.audio.unlock();
      this.audio.play('uiClick');
      handler();
    });
  }

  private wireStaticButtons(): void {
    this.click('btn-new-game', () => this.show('setup'));
    this.click('btn-continue', () => this.callbacks.onContinue());
    this.click('btn-settings', () => this.openSettings('menu'));
    this.click('btn-rules', () => this.openRules('menu'));

    this.click('btn-setup-back', () => this.show('menu'));
    this.click('btn-setup-next', () => this.show('theme'));

    this.click('btn-theme-back', () => this.show('setup'));
    this.click('btn-start', () => {
      this.persist();
      this.callbacks.onStartGame(this.activePlayers(), this.settings.themeId);
    });

    this.click('btn-pause', () => this.callbacks.onPause());
    this.click('btn-resume', () => this.callbacks.onResume());
    this.click('btn-pause-settings', () => this.openSettings('pause'));
    this.click('btn-pause-rules', () => this.openRules('pause'));
    this.click('btn-quit', () => this.callbacks.onQuit());

    this.click('btn-rematch', () => this.callbacks.onRematch());
    this.click('btn-to-menu', () => this.callbacks.onQuit());

    this.click('btn-settings-close', () => this.show(this.returnScreen));
    this.click('btn-rules-close', () => this.show(this.returnScreen));

    this.click('btn-roll', () => this.callbacks.onRoll());

    this.wireSettingsControls();
  }

  private openSettings(from: ScreenId): void {
    this.returnScreen = from;
    this.show('settings');
  }

  private openRules(from: ScreenId): void {
    this.returnScreen = from;
    this.show('rules');
  }

  // --- Počet hráčov -------------------------------------------------------

  private buildPlayerCountSelector(): void {
    const container = el('player-count');
    container.innerHTML = '';
    for (const count of [2, 3, 4]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(count);
      button.setAttribute('aria-pressed', String(count === this.playerCount));
      button.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.play('uiClick');
        this.playerCount = count;
        this.resolveColorConflicts();
        this.buildPlayerCountSelector();
        this.renderPlayerSlots();
      });
      container.appendChild(button);
    }
  }

  private activePlayers(): PlayerSetup[] {
    return this.settings.players.slice(0, this.playerCount);
  }

  /**
   * Po zmene počtu hráčov (alebo pri načítaní starých nastavení) môžu dvaja hráči
   * zdieľať farbu figúrok. Prvý si ju ponechá, ďalší dostane najbližšiu voľnú.
   */
  private resolveColorConflicts(): void {
    const used = new Set<string>();
    for (let i = 0; i < this.playerCount; i++) {
      const player = this.settings.players[i];
      if (!used.has(player.pieceColorId)) {
        used.add(player.pieceColorId);
        continue;
      }
      const free = COLOR_OPTIONS.find((c) => !used.has(c.id));
      if (free) {
        player.pieceColorId = free.id;
        used.add(free.id);
      }
    }
  }

  // --- Sloty hráčov -------------------------------------------------------

  private renderPlayerSlots(): void {
    const container = el('player-slots');
    container.innerHTML = '';
    for (let i = 0; i < this.playerCount; i++) {
      container.appendChild(this.buildSlot(i));
    }
  }

  private buildSlot(index: number): HTMLElement {
    const player = this.settings.players[index];
    const slot = document.createElement('div');
    slot.className = 'slot';

    // --- Hlavička: farebný bod + meno ---
    const head = document.createElement('div');
    head.className = 'slot-head';
    const swatch = document.createElement('span');
    swatch.className = 'slot-swatch';
    swatch.style.background = colorById(player.pieceColorId).hex;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = player.name;
    nameInput.maxLength = 16;
    nameInput.setAttribute('aria-label', `Meno hráča ${index + 1}`);
    nameInput.addEventListener('input', () => {
      player.name = nameInput.value.trim() || DEFAULT_PLAYER_NAMES[index];
    });
    head.append(swatch, nameInput);
    slot.appendChild(head);

    // --- Človek / Počítač ---
    const typeRow = document.createElement('div');
    typeRow.className = 'slot-row';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = 'Hrá';
    const typeGroup = document.createElement('div');
    typeGroup.className = 'segmented';
    for (const [label, isAI] of [
      ['Človek', false],
      ['Počítač', true],
    ] as Array<[string, boolean]>) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(player.isAI === isAI));
      button.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.play('uiClick');
        player.isAI = isAI;
        this.renderPlayerSlots();
      });
      typeGroup.appendChild(button);
    }
    typeRow.append(typeLabel, typeGroup);
    slot.appendChild(typeRow);

    // --- Farba figúrok (musí byť unikátna) ---
    slot.appendChild(
      this.buildSwatchRow('Farba figúrok', player.pieceColorId, false, (colorId) => {
        player.pieceColorId = colorId;
        this.renderPlayerSlots();
      }),
    );

    // --- Farba kocky (môže sa opakovať) ---
    slot.appendChild(
      this.buildSwatchRow('Farba kocky', player.diceColorId, true, (colorId) => {
        player.diceColorId = colorId;
        this.renderPlayerSlots();
      }),
    );

    return slot;
  }

  private buildSwatchRow(
    label: string,
    selectedId: string,
    isDice: boolean,
    onPick: (colorId: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slot-row';
    const title = document.createElement('span');
    title.textContent = label;
    const swatches = document.createElement('div');
    swatches.className = 'swatches';

    // Farby figúrok obsadené inými hráčmi sa nedajú zvoliť dvakrát.
    const taken = new Set(
      isDice ? [] : this.activePlayers().map((p) => p.pieceColorId).filter((id) => id !== selectedId),
    );

    for (const color of COLOR_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = isDice ? 'swatch dice-swatch' : 'swatch';
      button.style.background = color.hex;
      button.title = color.name;
      button.setAttribute('aria-label', `${label}: ${color.name}`);
      button.setAttribute('aria-pressed', String(color.id === selectedId));
      button.disabled = taken.has(color.id);
      button.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.play('uiClick');
        onPick(color.id);
      });
      swatches.appendChild(button);
    }

    row.append(title, swatches);
    return row;
  }

  // --- Výber plochy -------------------------------------------------------

  private buildThemeCards(): void {
    const container = el('theme-cards');
    container.innerHTML = '';
    for (const theme of THEMES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card';
      card.setAttribute('aria-pressed', String(theme.id === this.settings.themeId));

      const preview = document.createElement('div');
      preview.className = 'theme-preview';
      preview.style.background = `linear-gradient(160deg, ${theme.background.top}, ${theme.background.bottom})`;
      preview.appendChild(this.buildThemeMini(theme.id));

      const info = document.createElement('div');
      info.className = 'theme-info';
      const name = document.createElement('strong');
      name.textContent = theme.name;
      const tagline = document.createElement('small');
      tagline.textContent = theme.tagline;
      info.append(name, tagline);

      card.append(preview, info);
      card.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.play('uiClick');
        this.settings.themeId = theme.id;
        this.buildThemeCards();
      });
      container.appendChild(card);
    }
  }

  /**
   * Miniatúra dosky priamo z `layout.ts` — keď sa zmení topológia, náhľad
   * sa zmení s ňou a nemôže sa rozísť so skutočnou doskou.
   */
  private buildThemeMini(themeId: ThemeId): HTMLElement {
    const theme = THEMES.find((t) => t.id === themeId)!;
    const mini = document.createElement('div');
    mini.className = 'theme-mini';
    mini.style.background = theme.board.color;

    const playerColors = this.activePlayers().map((p) => colorById(p.pieceColorId).hex);
    const cellColor = new Map<string, string>();
    TRACK_CELLS.forEach((cell, index) => {
      const owner = index % 10 === 0 ? index / 10 : null;
      const color =
        owner !== null && owner < playerColors.length ? playerColors[owner] : theme.field.color;
      cellColor.set(`${cell.col},${cell.row}`, color);
    });
    HOME_CELLS.forEach((cells, player) => {
      if (player >= playerColors.length) return;
      cells.forEach((c) => cellColor.set(`${c.col},${c.row}`, playerColors[player]));
    });
    YARD_CELLS.forEach((cells, player) => {
      if (player >= playerColors.length) return;
      cells.forEach((c) => cellColor.set(`${c.col},${c.row}`, playerColors[player]));
    });

    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        const dot = document.createElement('i');
        const color = cellColor.get(`${col},${row}`);
        if (color) dot.style.background = color;
        mini.appendChild(dot);
      }
    }
    return mini;
  }

  // --- Nastavenia ---------------------------------------------------------

  private syncSettingsControls(): void {
    el<HTMLInputElement>('set-sound').checked = !this.audio.muted;
    el<HTMLInputElement>('set-volume').value = String(Math.round(this.audio.volume * 100));
    el<HTMLSelectElement>('set-shadows').value = this.settings.shadowQuality;
    el<HTMLSelectElement>('set-speed').value = String(this.settings.animationSpeed);
    el<HTMLInputElement>('set-rotate').checked = this.settings.rotateCamera;
    el<HTMLInputElement>('set-auto').checked = this.settings.autoSingleMove;
  }

  private wireSettingsControls(): void {
    el('set-sound').addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      this.audio.unlock();
      this.audio.setMuted(!on);
      if (on) this.audio.play('uiClick');
    });
    el('set-volume').addEventListener('input', (e) => {
      this.audio.setVolume(Number((e.target as HTMLInputElement).value) / 100);
    });
    el('set-shadows').addEventListener('change', (e) => {
      this.settings.shadowQuality = (e.target as HTMLSelectElement).value as ShadowQuality;
      this.emitSettings();
    });
    el('set-speed').addEventListener('change', (e) => {
      this.settings.animationSpeed = Number((e.target as HTMLSelectElement).value);
      this.emitSettings();
    });
    el('set-rotate').addEventListener('change', (e) => {
      this.settings.rotateCamera = (e.target as HTMLInputElement).checked;
      this.emitSettings();
    });
    el('set-auto').addEventListener('change', (e) => {
      this.settings.autoSingleMove = (e.target as HTMLInputElement).checked;
      this.emitSettings();
    });
  }

  private emitSettings(): void {
    this.persist();
    this.callbacks.onSettingsChanged(this.settings);
  }

  private persist(): void {
    saveSettings({ ...this.settings, players: this.activePlayers() });
  }

  refreshContinueButton(): void {
    el<HTMLButtonElement>('btn-continue').disabled = !hasSave();
  }

  // --- HUD ----------------------------------------------------------------

  /** Aktualizuje pruh s hráčmi (farba, meno, koľko figúrok je doma). */
  renderPlayersStrip(
    players: Array<{ name: string; color: string; isAI: boolean; home: number; active: boolean; finished: boolean }>,
  ): void {
    const strip = el('players-strip');
    strip.innerHTML = '';
    for (const player of players) {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      if (player.active) chip.classList.add('active');
      if (player.finished) chip.classList.add('inactive');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = player.color;

      const name = document.createElement('span');
      name.textContent = player.isAI ? `${player.name} 🤖` : player.name;

      const progress = document.createElement('span');
      progress.className = 'progress';
      progress.textContent = `${player.home}/4`;

      chip.append(dot, name, progress);
      strip.appendChild(chip);
    }
  }

  setTurn(name: string, color: string, hint: string): void {
    el('turn-name').textContent = name;
    el('turn-hint').textContent = hint;
    el('turn-dot').style.background = color;
  }

  /** Stav tlačidla hodu: aktívne / neaktívne / režim „vyber figúrku". */
  setRollButton(state: 'roll' | 'disabled' | 'pick', value: number | null): void {
    const button = el<HTMLButtonElement>('btn-roll');
    const label = button.querySelector('.roll-label') as HTMLElement;
    button.disabled = state !== 'roll';
    button.classList.toggle('waiting-move', state === 'pick');
    label.textContent = state === 'pick' ? 'Vyber figúrku' : 'Hoď kockou';
    el('roll-value').textContent = value === null ? '' : `🎲 ${value}`;
  }

  log(message: string): void {
    this.logLines.push(message);
    // Viac než 5 riadkov by prekrylo dosku.
    if (this.logLines.length > 5) this.logLines.shift();
    const container = el('log');
    container.innerHTML = '';
    for (const line of this.logLines) {
      const div = document.createElement('div');
      div.textContent = line;
      container.appendChild(div);
    }
  }

  clearLog(): void {
    this.logLines = [];
    el('log').innerHTML = '';
  }

  // --- Koniec hry ---------------------------------------------------------

  showEndScreen(
    title: string,
    ranking: Array<{ name: string; color: string; rank: number }>,
  ): void {
    el('end-title').textContent = title;
    const podium = el('podium');
    podium.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4.'];
    for (const entry of ranking) {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = medals[entry.rank - 1] ?? `${entry.rank}.`;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = entry.color;
      const name = document.createElement('span');
      name.textContent = entry.name;
      li.append(rank, dot, name);
      podium.appendChild(li);
    }
    this.show('end');
  }

  /** Predvyplní setup obrazovku podľa uloženej partie (pre odvetu). */
  setPlayerCount(count: number): void {
    this.playerCount = Math.min(4, Math.max(2, count));
    this.buildPlayerCountSelector();
    this.renderPlayerSlots();
  }

  getActivePlayers(): PlayerSetup[] {
    return this.activePlayers();
  }
}
