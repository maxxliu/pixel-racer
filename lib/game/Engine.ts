import * as THREE from 'three';

// F1 Professional Racing color palette
const PIXEL_COLORS = {
  black: 0x171717,    // Carbon black
  dark: 0x262626,     // Charcoal
  mid: 0x404040,      // Slate
  ground: 0x1f2937,   // Dark blue-gray ground
};

export interface EngineOptions {
  container: HTMLElement;
  antialias?: boolean;
  shadows?: boolean;
  pixelRatio?: number;
}

export class Engine {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  constructor(options: EngineOptions) {
    this.container = options.container;

    // Create renderer - antialias disabled by default for retro look
    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? false, // Disabled for pixelated look
      powerPreference: 'high-performance',
    });

    // Lower pixel ratio for more pixelated appearance
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Simpler tone mapping for flatter, more retro colors
    this.renderer.toneMapping = THREE.NoToneMapping;

    if (options.shadows ?? true) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap; // Simpler shadows for retro look
    }

    this.container.appendChild(this.renderer.domElement);

    // Create scene
    this.scene = new THREE.Scene();

    // Dark gray sky for F1 professional look
    this.scene.background = new THREE.Color(PIXEL_COLORS.black);

    // Fog for depth
    this.scene.fog = new THREE.Fog(PIXEL_COLORS.black, 200, 800);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 10, -20);
    this.camera.lookAt(0, 0, 0);

    // Setup lighting
    this.setupLighting();

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private setupLighting(): void {
    // Stronger ambient light for flatter retro look
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light (sun) - stronger, simpler
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024; // Lower resolution for retro look
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.bias = -0.001;
    this.scene.add(directionalLight);

    // Simple hemisphere light for color variation
    const hemisphereLight = new THREE.HemisphereLight(
      PIXEL_COLORS.dark,   // Sky color
      PIXEL_COLORS.ground, // Ground color
      0.4
    );
    this.scene.add(hemisphereLight);
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.dispose();

    // Safely remove renderer element if it's still a child
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    // Dispose all scene resources
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
