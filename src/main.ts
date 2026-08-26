/**
 * Vstupný bod appky. Iba nájde plátno, overí konzistenciu layoutu a spustí kontrolér.
 */

import './style.css';
import { Controller } from './controller';
import { assertLayoutConsistent } from './render/layout';

// Chytí nesúlad medzi topológiou jadra a 3D layoutom hneď pri štarte,
// nie až vtedy, keď figúrka skončí na nesprávnom poli.
assertLayoutConsistent();

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('V DOM chýba <canvas id="scene">.');
}

const controller = new Controller(canvas);

// V dev režime sprístupní kontrolér v konzole — bez toho sa stav 3D scény
// dá overiť len od oka na screenshote.
if (import.meta.env.DEV) {
  (window as unknown as { game: Controller }).game = controller;
}
