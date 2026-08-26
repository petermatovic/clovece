/**
 * Procedurálne textúry generované do `<canvas>`.
 *
 * Zámerne žiadne obrázkové assety — doska tak nemá čo načítavať, appka ostáva
 * malá a témy sa dajú ladiť zmenou čísel namiesto prekresľovania v grafickom editore.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

const SIZE = 1024;

function createCanvas(size = SIZE): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D kontext nie je dostupný — textúry sa nedajú vygenerovať.');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeat = 1): Texture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

/** Deterministický pseudonáhodný generátor, aby textúra vyzerala pri každom spustení rovnako. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Drevo s letokruhmi — teplý klasický vzhľad. */
export function woodTexture(base = '#c98a4b', dark = '#8b5a2b'): Texture {
  const { canvas, ctx } = createCanvas();
  const rand = seeded(7);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Letokruhy ako mierne zvlnené vodorovné pruhy.
  for (let y = 0; y < SIZE; y += 3) {
    const wobble = Math.sin(y * 0.02) * 6 + rand() * 3;
    const alpha = 0.04 + rand() * 0.07;
    ctx.strokeStyle = dark;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= SIZE; x += 16) {
      const yy = y + Math.sin(x * 0.01 + wobble) * 4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // Jemné hrče pre nepravidelnosť.
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 14; i++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const r = 8 + rand() * 26;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, dark);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(canvas, 2);
}

/** Mramor — svetlý podklad s tmavšími žilkami. */
export function marbleTexture(base = '#f2efe9', vein = '#b9b2a4'): Texture {
  const { canvas, ctx } = createCanvas();
  const rand = seeded(21);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = vein;
    ctx.globalAlpha = 0.05 + rand() * 0.13;
    ctx.lineWidth = 1 + rand() * 5;
    ctx.beginPath();
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    ctx.moveTo(x, y);
    const steps = 30 + Math.floor(rand() * 40);
    let dx = (rand() - 0.5) * 40;
    let dy = (rand() - 0.5) * 40;
    for (let s = 0; s < steps; s++) {
      dx += (rand() - 0.5) * 14;
      dy += (rand() - 0.5) * 14;
      x += dx;
      y += dy;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(canvas, 1);
}

/** Tmavý matný povrch s jemným šumom — podklad pre neónovú tému. */
export function darkTexture(base = '#12141c'): Texture {
  const { canvas, ctx } = createCanvas(512);
  const rand = seeded(99);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  const image = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);
  return finish(canvas, 1);
}

/** Pastelový podklad s jemnými bublinami — detská téma. */
export function candyTexture(base = '#fff4ea'): Texture {
  const { canvas, ctx } = createCanvas();
  const rand = seeded(303);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const colors = ['#ffd6e0', '#d6f0ff', '#e2ffd6', '#fff2c2'];
  for (let i = 0; i < 90; i++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const r = 20 + rand() * 90;
    ctx.globalAlpha = 0.16 + rand() * 0.16;
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(canvas, 1);
}

/**
 * Textúra jednej steny kocky s daným počtom bodiek.
 * Bodky sa kreslia programovo, takže farba kocky aj bodiek je plne nastaviteľná.
 */
export function diceFaceTexture(value: number, bodyColor: string, pipColor: string): Texture {
  const S = 256;
  const { canvas, ctx } = createCanvas(S);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(0, 0, S, S);

  // Jemný vinetový tieň pri okrajoch, aby stena nepôsobila ploche.
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  const a = S * 0.26;
  const b = S * 0.5;
  const c = S * 0.74;
  const layouts: Record<number, Array<[number, number]>> = {
    1: [[b, b]],
    2: [
      [a, a],
      [c, c],
    ],
    3: [
      [a, a],
      [b, b],
      [c, c],
    ],
    4: [
      [a, a],
      [c, a],
      [a, c],
      [c, c],
    ],
    5: [
      [a, a],
      [c, a],
      [b, b],
      [a, c],
      [c, c],
    ],
    6: [
      [a, a],
      [c, a],
      [a, b],
      [c, b],
      [a, c],
      [c, c],
    ],
  };

  const r = S * 0.085;
  for (const [x, y] of layouts[value]) {
    // Tieň bodky pre dojem vyrazenia do materiálu.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(x + r * 0.15, y + r * 0.18, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pipColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
