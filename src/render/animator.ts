/**
 * Fronta animácií. Herné jadro emituje udalosti okamžite, ale vizuálne musia
 * ísť za sebou (figúrka doskáče, až potom letí vyhodená späť do dvora).
 * Preto sa animácie radia do fronty a `update()` posúva vždy tú prvú.
 */

import type { Object3D, Vector3 } from 'three';

type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Animation {
  duration: number;
  elapsed: number;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
}

export class Animator {
  private queue: Animation[] = [];
  /** Násobič rýchlosti z nastavení (1 = normál, 2 = dvakrát rýchlejšie). */
  speed = 1;

  get isBusy(): boolean {
    return this.queue.length > 0;
  }

  /** Pridá animáciu na koniec fronty. */
  push(duration: number, onUpdate: (t: number) => void, onComplete?: () => void): void {
    this.queue.push({ duration, elapsed: 0, onUpdate, onComplete });
  }

  /** Pauza medzi animáciami — aby bol ťah čitateľný. */
  wait(duration: number, onComplete?: () => void): void {
    this.push(duration, () => {}, onComplete);
  }

  /** Zavolá callback hneď, ako na neho príde rad vo fronte. */
  then(callback: () => void): void {
    this.push(0, () => {}, callback);
  }

  update(deltaSeconds: number): void {
    if (this.queue.length === 0) return;
    const animation = this.queue[0];
    animation.elapsed += deltaSeconds * this.speed;
    const t = animation.duration <= 0 ? 1 : Math.min(1, animation.elapsed / animation.duration);
    animation.onUpdate(t);
    if (t >= 1) {
      this.queue.shift();
      animation.onComplete?.();
      // Nulové animácie (`then`) by inak čakali celý snímok navyše.
      if (animation.duration <= 0) this.update(0);
    }
  }

  clear(): void {
    this.queue = [];
  }
}

/**
 * Skok objektu z bodu do bodu po parabole + „squash & stretch" pri dopade.
 * Práve toto dáva figúrkam život — bez neho pôsobia ako posúvané ikonky.
 */
export function hopTo(
  animator: Animator,
  object: Object3D,
  from: Vector3,
  to: Vector3,
  duration: number,
  height: number,
  onLand?: () => void,
): void {
  animator.push(
    duration,
    (t) => {
      const eased = easeInOutCubic(t);
      object.position.lerpVectors(from, to, eased);
      // Parabola: v polovici cesty je figúrka najvyššie.
      object.position.y = from.y + (to.y - from.y) * eased + Math.sin(t * Math.PI) * height;
      // Natiahnutie pri stúpaní, stlačenie tesne pred dopadom.
      const stretch = 1 + Math.sin(t * Math.PI) * 0.14;
      const squash = t > 0.86 ? 1 - (t - 0.86) * 1.4 : 1;
      object.scale.set(1 / stretch, stretch * squash, 1 / stretch);
    },
    () => {
      object.position.copy(to);
      object.scale.set(1, 1, 1);
      onLand?.();
    },
  );
}
