/**
 * Postaví 3D dosku podľa zvolenej témy.
 *
 * Geometria je pre všetky témy rovnaká (vychádza z `layout.ts`), mení sa len
 * materiál a štýl polí. Celé je to jeden `Group`, ktorý sa dá pri zmene témy
 * naraz odstrániť a postaviť odznova.
 */

import {
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FIELDS_PER_PLAYER } from '../core/board';
import type { PlayerIndex } from '../core/types';
import { CELL, GRID_SIZE, HOME_CELLS, TRACK_CELLS, YARD_CELLS, cellToWorld } from './layout';
import type { Theme } from './themes';

/** Priemer kruhového poľa vzhľadom na rozostup buniek. */
const FIELD_RADIUS = CELL * 0.38;
/** Hrúbka dosky. */
const BOARD_THICKNESS = 0.5;
/** Horná hrana dosky (y), na ktorej ležia polia. */
export const BOARD_TOP = BOARD_THICKNESS / 2;

export interface BoardBuildResult {
  group: Group;
  /** Meshe polí dráhy podľa indexu 0..39 — pre efekty (ripple, zvýraznenie). */
  trackFieldMeshes: Mesh[];
  dispose: () => void;
}

/**
 * @param playerColors farby hráčov v poradí indexov; určujú farbu štartových polí,
 *                     domčekov a dvorov, takže hráč hneď vidí, kam patrí.
 */
export function buildBoard(theme: Theme, playerColors: string[]): BoardBuildResult {
  const group = new Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const track = (mesh: Mesh) => {
    disposables.push(mesh.geometry);
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => disposables.push(m));
    else disposables.push(material);
    return mesh;
  };

  // --- Rám (o kúsok väčší kváder pod doskou) ---
  const frameSize = GRID_SIZE * CELL + 1.1;
  const frameGeo = new RoundedBoxGeometry(frameSize, BOARD_THICKNESS * 0.9, frameSize, 4, 0.28);
  const frameMat = new MeshStandardMaterial({
    color: theme.frame.color,
    roughness: theme.frame.roughness,
    metalness: theme.frame.metalness,
  });
  const frame = track(new Mesh(frameGeo, frameMat));
  frame.position.y = -0.08;
  frame.receiveShadow = true;
  frame.castShadow = true;
  group.add(frame);

  // --- Doska ---
  const boardSize = GRID_SIZE * CELL + 0.3;
  const boardGeo = new RoundedBoxGeometry(boardSize, BOARD_THICKNESS, boardSize, 4, 0.12);
  const boardMat = new MeshPhysicalMaterial({
    color: theme.board.color,
    map: theme.boardTexture(),
    roughness: theme.board.roughness,
    metalness: theme.board.metalness,
    clearcoat: theme.board.clearcoat,
    clearcoatRoughness: 0.35,
  });
  const board = track(new Mesh(boardGeo, boardMat));
  board.receiveShadow = true;
  group.add(board);
  disposables.push(boardMat.map!);

  // --- Polia dráhy ---
  const trackFieldMeshes: Mesh[] = [];
  TRACK_CELLS.forEach((cell, index) => {
    // Štartové pole hráča dostane jeho farbu, ostatné neutrálnu farbu témy.
    const owner = index % FIELDS_PER_PLAYER === 0 ? (index / FIELDS_PER_PLAYER) as PlayerIndex : null;
    const color = owner !== null ? playerColors[owner] ?? theme.field.color : theme.field.color;
    const isStart = owner !== null;
    const field = makeField(theme, color, isStart, disposables);
    field.position.copy(cellToWorld(cell, BOARD_TOP + 0.011));
    group.add(field);
    trackFieldMeshes.push(field);
  });

  // --- Domčeky ---
  HOME_CELLS.forEach((cells, player) => {
    if (player >= playerColors.length) return;
    cells.forEach((cell) => {
      const field = makeField(theme, playerColors[player], true, disposables);
      field.position.copy(cellToWorld(cell, BOARD_TOP + 0.011));
      group.add(field);
    });
  });

  // --- Štartové dvory ---
  YARD_CELLS.forEach((cells, player) => {
    if (player >= playerColors.length) return;
    // Podložka pod dvorom, aby bol vizuálne odlíšený od zvyšku dosky.
    const padGeo = new RoundedBoxGeometry(CELL * 2.2, 0.06, CELL * 2.2, 3, 0.2);
    const padMat = new MeshStandardMaterial({
      color: playerColors[player],
      roughness: 0.5,
      metalness: theme.id === 'marble' ? 0.5 : 0.05,
      transparent: true,
      opacity: 0.28,
    });
    const pad = track(new Mesh(padGeo, padMat));
    const center = cellToWorld({ col: (cells[0].col + cells[3].col) / 2, row: (cells[0].row + cells[3].row) / 2 }, BOARD_TOP + 0.006);
    pad.position.copy(center);
    group.add(pad);

    cells.forEach((cell) => {
      const field = makeField(theme, playerColors[player], true, disposables);
      field.position.copy(cellToWorld(cell, BOARD_TOP + 0.014));
      group.add(field);
    });
  });

  return {
    group,
    trackFieldMeshes,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/** Jedno pole dráhy/domčeka. Vzhľad riadi `theme.field.style`. */
function makeField(
  theme: Theme,
  color: string,
  emphasized: boolean,
  disposables: Array<{ dispose: () => void }>,
): Mesh {
  const style = theme.field.style;

  if (style === 'neon') {
    // Svietiaci prstenec — telo poľa je tmavé, žiari len obruba.
    const geo = new RingGeometry(FIELD_RADIUS * 0.62, FIELD_RADIUS, 40);
    const mat = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: theme.field.emissiveIntensity * (emphasized ? 1.5 : 1),
      side: DoubleSide,
      toneMapped: false,
    });
    disposables.push(geo, mat);
    const mesh = new Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  if (style === 'inlay') {
    // Zlatá intarzia — tenký kotúč s kovovým leskom.
    const geo = new CylinderGeometry(FIELD_RADIUS, FIELD_RADIUS, 0.035, 40);
    const mat = new MeshPhysicalMaterial({
      color,
      roughness: 0.16,
      metalness: emphasized ? 0.75 : 1.0,
      clearcoat: 1.0,
    });
    disposables.push(geo, mat);
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  if (style === 'candy') {
    // Vypuklý „cukríkový" kotúč.
    const geo = new CylinderGeometry(FIELD_RADIUS, FIELD_RADIUS * 0.92, 0.09, 32);
    const mat = new MeshPhysicalMaterial({
      color,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.8,
      emissive: color,
      emissiveIntensity: theme.field.emissiveIntensity,
    });
    disposables.push(geo, mat);
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // 'inset' — vyfrézované pole s tmavšou obrubou.
  const geo = new CircleGeometry(FIELD_RADIUS, 36);
  const mat = new MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.0,
  });
  disposables.push(geo, mat);
  const mesh = new Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  const rimGeo = new RingGeometry(FIELD_RADIUS, FIELD_RADIUS * 1.13, 36);
  const rimMat = new MeshStandardMaterial({
    color: theme.field.rimColor,
    roughness: 0.6,
    side: DoubleSide,
  });
  disposables.push(rimGeo, rimMat);
  const rim = new Mesh(rimGeo, rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -0.002;
  mesh.add(rim);
  return mesh;
}

/** Odstráni objekt zo scény a uvoľní jeho GPU zdroje. */
export function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
  object.removeFromParent();
}
