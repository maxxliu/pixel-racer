import * as THREE from 'three';
import { PALETTE } from './palette';
import type { Quality } from '@/lib/settings';

export interface EngineOptions {
  container: HTMLElement;
  quality?: Quality;
}

/** Renderer, scene, camera, lights. Sunset lighting; the shadow camera follows a target. */
export class Engine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly sun: THREE.DirectionalLight;
  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver | null = null;
  private readonly sunOffset = new THREE.Vector3(-90, 55, -70);
  private disposed = false;

  constructor(options: EngineOptions) {
    this.container = options.container;
    const quality = options.quality ?? 'high';
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    });
    const dprCap = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.renderer.setSize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const horizon = new THREE.Color(PALETTE.horizon);
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, 140, 720);

    const aspect = Math.max(0.1, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    this.camera = new THREE.PerspectiveCamera(66, aspect, 0.3, 1600);
    this.camera.position.set(0, 6, -14);

    const ambient = new THREE.AmbientLight(0xffe6d0, 0.28);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x6c4fb0, 0xb06a4a, 0.55);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffd9a3, 2.3);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 320;
    const ext = 70;
    this.sun.shadow.camera.left = -ext;
    this.sun.shadow.camera.right = ext;
    this.sun.shadow.camera.top = ext;
    this.sun.shadow.camera.bottom = -ext;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
  }

  /** Keep the shadow frustum centred on the player. */
  public followShadow(x: number, z: number): void {
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.sun.shadow.map?.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
