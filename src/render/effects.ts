/**
 * Časticové efekty: vyhodenie súpera, dobehnutie do domčeka, konfety pri výhre,
 * a „ripple" krúžok na poli, kam figúrka dopadla.
 *
 * Všetko sú jednoduché Points/Mesh systémy s vlastnou aktualizáciou v `update()`,
 * bez závislosti na ďalších knižniciach.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  Vector3,
  DoubleSide,
} from 'three';

interface Burst {
  points: Points;
  velocities: Vector3[];
  life: number;
  maxLife: number;
  gravity: number;
}

interface Ripple {
  mesh: Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

export class Effects {
  private bursts: Burst[] = [];
  private ripples: Ripple[] = [];

  constructor(private scene: Scene) {}

  /** Výbuch častíc v danom bode. */
  burst(position: Vector3, color: string, count = 40, speed = 3.4, gravity = 7): void {
    const positions = new Float32Array(count * 3);
    const velocities: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      // Náhodný smer v pologuli nahor.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const v = speed * (0.5 + Math.random() * 0.7);
      velocities.push(
        new Vector3(
          Math.sin(phi) * Math.cos(theta) * v,
          Math.cos(phi) * v,
          Math.sin(phi) * Math.sin(theta) * v,
        ),
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: new Color(color),
      size: 0.16,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new Points(geometry, material);
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: 0, maxLife: 1.1, gravity });
  }

  /** Zlaté iskry pri vstupe do domčeka — pomalšie a bez gravitácie nadol. */
  sparkle(position: Vector3, color = '#ffd76a'): void {
    this.burst(position, color, 60, 2.2, 2.2);
  }

  /** Rozpínajúci sa krúžok na doske v mieste dopadu figúrky. */
  ripple(position: Vector3, color: string): void {
    const geometry = new RingGeometry(0.24, 0.32, 32);
    const material = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    mesh.position.y += 0.02;
    this.scene.add(mesh);
    this.ripples.push({ mesh, life: 0, maxLife: 0.6, maxScale: 2.6 });
  }

  /** Konfety z výšky nad doskou — záverečná oslava. */
  confetti(colors: string[]): void {
    for (let i = 0; i < 6; i++) {
      const color = colors[i % colors.length];
      const origin = new Vector3((Math.random() - 0.5) * 8, 9 + Math.random() * 3, (Math.random() - 0.5) * 8);
      this.burst(origin, color, 70, 2.0, 3.2);
    }
  }

  update(delta: number): void {
    // --- Výbuchy ---
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.life += delta;
      const attribute = burst.points.geometry.getAttribute('position');
      const array = attribute.array as Float32Array;
      for (let p = 0; p < burst.velocities.length; p++) {
        const v = burst.velocities[p];
        v.y -= burst.gravity * delta;
        array[p * 3] += v.x * delta;
        array[p * 3 + 1] += v.y * delta;
        array[p * 3 + 2] += v.z * delta;
      }
      attribute.needsUpdate = true;
      const material = burst.points.material as PointsMaterial;
      material.opacity = Math.max(0, 1 - burst.life / burst.maxLife);
      if (burst.life >= burst.maxLife) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
      }
    }

    // --- Krúžky ---
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];
      ripple.life += delta;
      const t = Math.min(1, ripple.life / ripple.maxLife);
      const scale = 1 + t * (ripple.maxScale - 1);
      ripple.mesh.scale.set(scale, scale, scale);
      (ripple.mesh.material as MeshBasicMaterial).opacity = 0.75 * (1 - t);
      if (t >= 1) {
        this.scene.remove(ripple.mesh);
        ripple.mesh.geometry.dispose();
        (ripple.mesh.material as MeshBasicMaterial).dispose();
        this.ripples.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const burst of this.bursts) {
      this.scene.remove(burst.points);
      burst.points.geometry.dispose();
      (burst.points.material as PointsMaterial).dispose();
    }
    for (const ripple of this.ripples) {
      this.scene.remove(ripple.mesh);
      ripple.mesh.geometry.dispose();
      (ripple.mesh.material as MeshBasicMaterial).dispose();
    }
    this.bursts = [];
    this.ripples = [];
  }
}
