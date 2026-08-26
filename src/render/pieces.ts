/**
 * Figúrky — procedurálny „pešiak" z rotačného profilu (LatheGeometry).
 * Žiadne externé 3D modely: tvar sa dá ladiť zmenou pár čísel a appka
 * nemusí nič sťahovať.
 */

import {
  Color,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  RingGeometry,
  SphereGeometry,
  Vector2,
  DoubleSide,
} from 'three';
import type { Piece, PlayerIndex } from '../core/types';
import { BOARD_TOP } from './boardBuilder';
import { locationToWorld } from './layout';
import type { Theme } from './themes';

const HEIGHT_SCALE = 0.62;

/** Profil pešiaka zdola nahor: široká pätka, štíhly driek, kalich pod hlavičkou. */
function pawnProfile(): Vector2[] {
  const points: Vector2[] = [];
  const add = (x: number, y: number) => points.push(new Vector2(x, y * HEIGHT_SCALE));
  add(0.0, 0.0);
  add(0.30, 0.0);
  add(0.32, 0.05);
  add(0.30, 0.12);
  add(0.20, 0.20);
  add(0.14, 0.34);
  add(0.13, 0.55);
  add(0.16, 0.66);
  add(0.24, 0.72);
  add(0.20, 0.78);
  add(0.13, 0.82);
  add(0.0, 0.84);
  return points;
}

export interface PieceView {
  group: Group;
  body: Mesh;
  head: Mesh;
  /** Krúžok pod figúrkou, ktorý sa rozsvieti, keď je ťah možný. */
  marker: Mesh;
  owner: PlayerIndex;
  pieceId: number;
  /** Index figúrky v `GameState.pieces` — spojka medzi 3D a herným jadrom. */
  stateIndex: number;
}

export class PieceFactory {
  private geometry: LatheGeometry;
  private headGeometry: SphereGeometry;
  private markerGeometry: RingGeometry;
  private materials = new Map<string, MeshPhysicalMaterial>();
  private markerMaterials = new Map<string, MeshPhysicalMaterial>();

  constructor(private theme: Theme) {
    this.geometry = new LatheGeometry(pawnProfile(), 36);
    this.geometry.computeVertexNormals();
    this.headGeometry = new SphereGeometry(0.17, 24, 18);
    this.markerGeometry = new RingGeometry(0.3, 0.4, 32);
  }

  private materialFor(color: string): MeshPhysicalMaterial {
    let material = this.materials.get(color);
    if (!material) {
      const finish = this.theme.pieceFinish;
      material = new MeshPhysicalMaterial({
        color: new Color(color),
        roughness: finish.roughness,
        metalness: finish.metalness,
        clearcoat: finish.clearcoat,
        clearcoatRoughness: 0.2,
        // Neónová téma dáva figúrkam vlastný jemný svit.
        emissive: new Color(color),
        emissiveIntensity: this.theme.id === 'neon' ? 0.35 : 0.0,
      });
      this.materials.set(color, material);
    }
    return material;
  }

  private markerMaterialFor(color: string): MeshPhysicalMaterial {
    let material = this.markerMaterials.get(color);
    if (!material) {
      material = new MeshPhysicalMaterial({
        color: new Color(color),
        emissive: new Color(color),
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        toneMapped: false,
      });
      this.markerMaterials.set(color, material);
    }
    // Každá figúrka potrebuje vlastnú inštanciu, aby sa dala rozsvietiť samostatne.
    return material.clone();
  }

  create(piece: Piece, stateIndex: number, color: string): PieceView {
    const group = new Group();
    const material = this.materialFor(color);

    const body = new Mesh(this.geometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const head = new Mesh(this.headGeometry, material);
    head.position.y = 0.84 * HEIGHT_SCALE + 0.09;
    head.castShadow = true;
    group.add(head);

    const marker = new Mesh(this.markerGeometry, this.markerMaterialFor(color));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.012;
    group.add(marker);

    group.position.copy(
      locationToWorld(piece.owner, piece.location, piece.id, BOARD_TOP + 0.015),
    );

    return { group, body, head, marker, owner: piece.owner, pieceId: piece.id, stateIndex };
  }

  dispose(): void {
    this.geometry.dispose();
    this.headGeometry.dispose();
    this.markerGeometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.markerMaterials.forEach((m) => m.dispose());
    this.materials.clear();
    this.markerMaterials.clear();
  }
}

/** Zvýrazní/zhasne figúrky, na ktoré sa dá práve kliknúť. */
export function setPieceSelectable(view: PieceView, selectable: boolean): void {
  const material = view.marker.material as MeshPhysicalMaterial;
  material.userData.selectable = selectable;
  if (!selectable) material.opacity = 0;
}

/** Pulzovanie zvýraznených figúrok. Volá sa každý snímok. */
export function pulseSelectable(views: PieceView[], elapsed: number): void {
  const pulse = 0.45 + Math.sin(elapsed * 4.5) * 0.3;
  for (const view of views) {
    const material = view.marker.material as MeshPhysicalMaterial;
    if (material.userData.selectable) {
      material.opacity = pulse;
      view.group.position.y =
        (view.group.userData.baseY ?? view.group.position.y) + Math.sin(elapsed * 4.5) * 0.02;
    }
  }
}
