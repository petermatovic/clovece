/**
 * Three.js scéna: renderer, kamera, svetlá, tiene, pozadie.
 * Nevie nič o pravidlách — dostane tému a stará sa len o to, ako svet vyzerá.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Theme } from './themes';

export type ShadowQuality = 'off' | 'low' | 'high';

const SHADOW_MAP_SIZE: Record<Exclude<ShadowQuality, 'off'>, number> = {
  low: 1024,
  high: 2048,
};

export class SceneContext {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private sun: DirectionalLight;
  private ambient: AmbientLight;
  private stars: Points | null = null;
  private shadowQuality: ShadowQuality = 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    // Cap pixelRatio — na mobiloch s DPR 3+ by sa inak zbytočne renderovalo 9× viac pixelov.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene = new Scene();

    this.camera = new PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 14, 13);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;
    // Kamera nesmie zísť pod dosku ani nad zenit — inak sa hráč „stratí".
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 30;

    this.sun = new DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 45;
    const extent = 11;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    // Bez biasu vzniká na plochej doske „shadow acne" (pruhy vlastného tieňa).
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.ambient = new AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);

    this.resize();
  }

  /** Aplikuje svetelný a pozaďový preset témy. */
  applyTheme(theme: Theme): void {
    this.sun.color = new Color(theme.light.sunColor);
    this.sun.intensity = theme.light.sunIntensity;
    this.sun.position.set(...theme.light.sunPosition);
    this.sun.target.position.set(0, 0, 0);
    this.ambient.color = new Color(theme.light.ambientColor);
    this.ambient.intensity = theme.light.ambientIntensity;

    this.scene.background = gradientTexture(theme.background.top, theme.background.bottom);
    this.scene.fog = new Fog(new Color(theme.background.bottom).getHex(), 26, 60);

    this.setStars(theme.stars);
  }

  private setStars(enabled: boolean): void {
    if (!enabled) {
      if (this.stars) {
        this.scene.remove(this.stars);
        this.stars.geometry.dispose();
        (this.stars.material as PointsMaterial).dispose();
        this.stars = null;
      }
      return;
    }
    if (this.stars) return;

    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Hviezdy na guli okolo scény, ale nie pod doskou.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.9);
      const r = 42 + Math.random() * 14;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.stars = new Points(
      geometry,
      new PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true, fog: false }),
    );
    this.scene.add(this.stars);
  }

  setShadowQuality(quality: ShadowQuality): void {
    this.shadowQuality = quality;
    if (quality === 'off') {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      return;
    }
    this.renderer.shadowMap.enabled = true;
    this.sun.castShadow = true;
    const size = SHADOW_MAP_SIZE[quality];
    this.sun.shadow.mapSize.set(size, size);
    // Bez zneplatnenia sa zmena rozlíšenia neprejaví — Three.js si mapu drží.
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  getShadowQuality(): ShadowQuality {
    return this.shadowQuality;
  }

  /** Plynulé natočenie kamery k hráčovi na ťahu. `angle` v radiánoch. */
  orbitTo(angle: number, duration = 900): void {
    const from = this.camera.position.clone();
    const radius = Math.hypot(from.x, from.z);
    const height = from.y;
    const startAngle = Math.atan2(from.x, from.z);
    // Najkratšia cesta — bez tohto by sa kamera občas otočila „okolo sveta".
    let delta = angle - startAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 0.02) return;

    const startTime = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const a = startAngle + delta * eased;
      this.camera.position.set(Math.sin(a) * radius, height, Math.cos(a) * radius);
      this.camera.lookAt(this.controls.target);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Nastaví kameru na počiatočný pohľad daného hráča bez animácie. */
  snapTo(angle: number, radius = 17, height = 15): void {
    this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    this.camera.lookAt(this.controls.target);
  }

  /**
   * Zosúladí veľkosť kresliaceho bufferu s CSS veľkosťou plátna.
   * Volá sa KAŽDÝ snímok, nie len na 'resize' event: v konštruktore ešte layout
   * nemusí byť hotový (clientWidth = 0) a plátno by navždy zostalo na
   * predvolených 300x150 pixeloch bez akejkoľvek chyby v konzole.
   */
  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);
    if (canvas.width === targetWidth && canvas.height === targetHeight) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.resize();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Prevedie normalizované súradnice myši na lúč — pomôcka pre raycasting. */
  screenToNdc(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  get cameraTarget(): Vector3 {
    return this.controls.target;
  }
}

/** Zvislý lineárny gradient ako pozadie scény. */
function gradientTexture(top: string, bottom: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
