import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLOR_HEX, FACELET_NORMAL, FACELET_POS, SOLVED, apply, moveInfo, type State } from '../cube/cube.ts';

function roundedSquare(size: number, r: number) {
  const s = size / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-s + r, -s);
  sh.lineTo(s - r, -s);
  sh.quadraticCurveTo(s, -s, s, -s + r);
  sh.lineTo(s, s - r);
  sh.quadraticCurveTo(s, s, s - r, s);
  sh.lineTo(-s + r, s);
  sh.quadraticCurveTo(-s, s, -s, s - r);
  sh.lineTo(-s, -s + r);
  sh.quadraticCurveTo(-s, -s, -s + r, -s);
  return new THREE.ShapeGeometry(sh);
}

interface Job { tok: string; resolve: () => void }
interface Anim { job: Job; pivot: THREE.Group; sel: THREE.Object3D[]; axis: 'x' | 'y' | 'z'; angle: number; t0: number; dur: number }

export class CubeView {
  state: State;
  speed = 150;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private cubies: THREE.Object3D[] = [];
  private homes = new Map<THREE.Object3D, THREE.Vector3>();
  private stickers: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private queue: Job[] = [];
  private anim: Anim | null = null;

  constructor(el: HTMLElement, state: State = SOLVED) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.className = 'cube-canvas';
    el.appendChild(this.renderer.domElement);

    this.camera.position.set(5.6, 5.2, 7.8);
    this.camera.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.rotateSpeed = 0.7;

    this.scene.add(this.root);
    const body = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x161616 });
    const sticker = roundedSquare(0.84, 0.1);
    const map = new Map<string, THREE.Object3D>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const c = new THREE.Group();
          c.position.set(x, y, z);
          c.add(new THREE.Mesh(body, bodyMat));
          this.root.add(c);
          this.cubies.push(c);
          this.homes.set(c, c.position.clone());
          map.set(`${x},${y},${z}`, c);
        }
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 54; i++) {
      const n = new THREE.Vector3(...FACELET_NORMAL[i]);
      const m = new THREE.Mesh(sticker, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.position.copy(n).multiplyScalar(0.487);
      m.quaternion.setFromUnitVectors(zAxis, n);
      map.get(FACELET_POS[i].join(','))!.add(m);
      this.stickers.push(m);
    }
    this.paint();

    new ResizeObserver(() => this.resize(el)).observe(el);
    this.resize(el);
  }

  private resize(el: HTMLElement) {
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 30 * (h / w) ** 0.8 : 30;
    this.camera.updateProjectionMatrix();
  }

  private paint() {
    for (let i = 0; i < 54; i++) this.stickers[i].material.color.set(COLOR_HEX[this.state[i]] ?? COLOR_HEX.X);
  }

  setActive(on: boolean) {
    this.renderer.setAnimationLoop(on ? (t) => this.tick(t) : null);
  }

  setState(s: State) {
    if (this.anim) this.finish(false);
    for (const j of this.queue) j.resolve();
    this.queue = [];
    this.state = s;
    this.paint();
  }

  move(tok: string): Promise<void> {
    return new Promise((resolve) => this.queue.push({ tok, resolve }));
  }

  get busy() {
    return !!this.anim || this.queue.length > 0;
  }

  private start(job: Job) {
    const info = moveInfo(job.tok);
    const axis = (['x', 'y', 'z'] as const)[info.axis];
    const pivot = new THREE.Group();
    this.root.add(pivot);
    const sel = this.cubies.filter((c) => info.layers.includes(Math.round(this.homes.get(c)![axis])));
    for (const c of sel) pivot.attach(c);
    const backlog = this.queue.length;
    const dur = this.speed * (Math.abs(info.quarter) === 2 ? 1.4 : 1) / (backlog > 3 ? 2.5 : 1);
    this.anim = { job, pivot, sel, axis, angle: (info.quarter * Math.PI) / 2, t0: performance.now(), dur };
  }

  private finish(apply_ = true) {
    const a = this.anim!;
    for (const c of a.sel) {
      this.root.attach(c);
      c.position.copy(this.homes.get(c)!);
      c.quaternion.identity();
    }
    this.root.remove(a.pivot);
    this.anim = null;
    if (apply_) {
      this.state = apply(this.state, [a.job.tok]);
      this.paint();
    }
    a.job.resolve();
  }

  private tick(now: number) {
    if (!this.anim && this.queue.length) this.start(this.queue.shift()!);
    const a = this.anim;
    if (a) {
      const k = Math.min(1, (now - a.t0) / a.dur);
      const e = 1 - (1 - k) ** 3;
      a.pivot.rotation[a.axis] = a.angle * e;
      if (k >= 1) this.finish();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
