/**
 * 3D kocka s reálnou fyzikou (cannon-es).
 *
 * Výsledok sa NEGENERUJE dopredu — kocka sa naozaj hodí a po ustálení sa prečíta,
 * ktorá stena smeruje nahor. Ak by kocka zostala v nestabilnej polohe alebo
 * sa neustálila do časového limitu, hod sa zopakuje (viď `MAX_ROLL_SECONDS`).
 */

import * as CANNON from 'cannon-es';
import { Group, Mesh, MeshPhysicalMaterial, Scene, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { diceFaceTexture } from './textures';

const SIZE = 0.62;
const HALF = SIZE / 2;
/** Po koľkých sekundách sa hod považuje za zaseknutý a opakuje sa. */
const MAX_ROLL_SECONDS = 5;
/** Pod touto rýchlosťou sa kocka považuje za stojacu. */
const SETTLE_SPEED = 0.12;
/** Ako dlho musí stáť, aby sa výsledok prijal. */
const SETTLE_SECONDS = 0.35;

/**
 * Poradie materiálov BoxGeometry je [+X, -X, +Y, -Y, +Z, -Z].
 * Protiľahlé steny klasickej kocky dávajú súčet 7.
 */
const FACE_VALUES = [1, 6, 2, 5, 3, 4];
const FACE_NORMALS = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];

export class Dice {
  readonly group: Group;
  private mesh: Mesh;
  private body: CANNON.Body;
  private world: CANNON.World;
  private materials: MeshPhysicalMaterial[] = [];

  private rolling = false;
  private rollTime = 0;
  private stillTime = 0;
  private onResult: ((value: number) => void) | null = null;
  /** Koľkokrát sa hod už opakoval kvôli zaseknutiu — poistka proti nekonečnu. */
  private retries = 0;

  constructor(scene: Scene, private boardTop: number) {
    this.group = new Group();
    scene.add(this.group);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
    this.world.defaultContactMaterial.restitution = 0.32;
    this.world.defaultContactMaterial.friction = 0.32;

    // Podlaha na úrovni dosky.
    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.set(0, boardTop, 0);
    this.world.addBody(ground);

    // Neviditeľné mantinely, aby kocka neodletela mimo dosku.
    // CANNON.Plane má normálu +Z v lokálnom priestore, takže sa musí otáčať
    // OKOLO OSI Y — rotácia okolo X/Z normálu nezmení a vznikli by prekrývajúce
    // sa podlahy cez stred dosky, medzi ktorými sa kocka nikdy neustáli.
    const wall = 4.2;
    const walls: Array<[number, number, number]> = [
      [wall, 0, -Math.PI / 2], // stena vpravo, normála mieri do -X
      [-wall, 0, Math.PI / 2], // vľavo, normála +X
      [0, wall, Math.PI], //      vzadu, normála -Z
      [0, -wall, 0], //           vpredu, normála +Z
    ];
    for (const [x, z, rotY] of walls) {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
      body.position.set(x, boardTop, z);
      body.quaternion.setFromEuler(0, rotY, 0);
      this.world.addBody(body);
    }

    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
      angularDamping: 0.32,
      linearDamping: 0.06,
      allowSleep: true,
      sleepSpeedLimit: 0.22,
      sleepTimeLimit: 0.2,
    });
    this.world.allowSleep = true;
    this.world.addBody(this.body);

    const geometry = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, SIZE * 0.13);
    this.mesh = new Mesh(geometry, []);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.setColors('#f7f4ee', '#22252c');
    this.park();
  }

  /** Prefarbí kocku (telo + bodky) — každý hráč má vlastnú. */
  setColors(bodyColor: string, pipColor: string): void {
    this.materials.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.materials = FACE_VALUES.map(
      (value) =>
        new MeshPhysicalMaterial({
          map: diceFaceTexture(value, bodyColor, pipColor),
          roughness: 0.28,
          metalness: 0.05,
          clearcoat: 0.7,
        }),
    );
    this.mesh.material = this.materials;
  }

  /** Odloží kocku bokom mimo hracích polí, keď sa práve nehádže. */
  private park(): void {
    this.body.type = CANNON.Body.STATIC;
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.position.set(3.9, this.boardTop + HALF, 3.9);
    this.body.quaternion.set(0, 0, 0, 1);
    this.syncMesh();
  }

  get isRolling(): boolean {
    return this.rolling;
  }

  /** Pozícia kocky vo svete — pre raycasting (klik na kocku = hod). */
  get object(): Mesh {
    return this.mesh;
  }

  /**
   * Hodí kockou. `onResult` sa zavolá po ustálení s hodnotou 1..6.
   * Hod je skutočne fyzikálny, výsledok nie je predurčený.
   */
  roll(onResult: (value: number) => void): void {
    if (this.rolling) return;
    this.rolling = true;
    this.rollTime = 0;
    this.stillTime = 0;
    this.onResult = onResult;
    this.retries = 0;
    this.throwBody();
  }

  private throwBody(): void {
    this.body.type = CANNON.Body.DYNAMIC;
    this.body.wakeUp();
    this.body.position.set(-1.6 + Math.random() * 0.6, this.boardTop + 4.2, -1.6 + Math.random() * 0.6);
    this.body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    this.body.velocity.set(2.2 + Math.random() * 2.6, -1.5, 2.2 + Math.random() * 2.6);
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 22,
    );
  }

  update(delta: number): void {
    if (!this.rolling) return;
    // Fixný krok fyziky — pri premenlivom delta by hod nebol stabilný.
    this.world.step(1 / 60, delta, 4);
    this.syncMesh();
    this.rollTime += delta;

    const speed = this.body.velocity.length() + this.body.angularVelocity.length();
    if (speed < SETTLE_SPEED) {
      this.stillTime += delta;
    } else {
      this.stillTime = 0;
    }

    const settled = this.stillTime >= SETTLE_SECONDS;
    const timedOut = this.rollTime >= MAX_ROLL_SECONDS;
    if (!settled && !timedOut) return;

    const result = this.readTopFace();
    // Kocka na hrane (žiadna stena jasne nahor) → radšej hodiť znova.
    if (result === null && this.retries < 3) {
      this.retries += 1;
      this.rollTime = 0;
      this.stillTime = 0;
      this.throwBody();
      return;
    }

    this.rolling = false;
    const value = result ?? 1 + Math.floor(Math.random() * 6);
    const callback = this.onResult;
    this.onResult = null;
    callback?.(value);
  }

  /** Ktorá stena smeruje nahor? Null, ak žiadna nie je dostatočne vodorovná. */
  private readTopFace(): number | null {
    let bestIndex = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < FACE_NORMALS.length; i++) {
      const normal = FACE_NORMALS[i].clone().applyQuaternion(this.mesh.quaternion);
      if (normal.y > bestDot) {
        bestDot = normal.y;
        bestIndex = i;
      }
    }
    // 0.8 ≈ 37° odchýlka; viac znamená, že kocka stojí nakrivo.
    if (bestDot < 0.8) return null;
    return FACE_VALUES[bestIndex];
  }

  private syncMesh(): void {
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
    this.mesh.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w,
    );
  }

  /** Po dokončení ťahu odloží kocku bokom. */
  reset(): void {
    this.rolling = false;
    this.onResult = null;
    this.park();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.materials.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.group.removeFromParent();
  }
}
