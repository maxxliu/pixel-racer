import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TerrainChunk } from './TerrainChunk';
import { RoadBuilder } from './RoadBuilder';
import { EnvironmentBuilder } from './EnvironmentBuilder';

export interface WorldConfig {
  chunkSize: number;
  loadRadius: number;
  unloadRadius: number;
  terrainScale: number;
}

const DEFAULT_CONFIG: WorldConfig = {
  chunkSize: 256,
  loadRadius: 768, // 3 chunks
  unloadRadius: 1024, // 4 chunks
  terrainScale: 50, // Height variation
};

export class WorldManager {
  private scene: THREE.Scene;
  private physicsWorld: CANNON.World;
  private config: WorldConfig;

  private chunks: Map<string, TerrainChunk> = new Map();
  private loadingChunks: Set<string> = new Set();

  private groundBody: CANNON.Body | null = null;
  private roadBuilder: RoadBuilder;
  private environmentBuilder: EnvironmentBuilder;

  constructor(scene: THREE.Scene, physicsWorld: CANNON.World, config: Partial<WorldConfig> = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.roadBuilder = new RoadBuilder(scene);
    this.environmentBuilder = new EnvironmentBuilder(scene);
  }

  public async init(): Promise<void> {
    // Create base ground plane for physics
    this.createGroundPlane();

    // Skip terrain chunks for now - they cover the road
    // await this.loadChunksAroundPosition(new THREE.Vector3(0, 0, 0));

    // Build roads
    this.roadBuilder.buildTrackRoad();

    // Add environment objects (skip for now - too many trees on track)
    // this.environmentBuilder.populateEnvironment();

    // Add skybox
    this.createSkybox();
  }

  private createGroundPlane(): void {
    // Physics ground plane - infinite plane at y=0
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: groundShape,
      material: new CANNON.Material('ground'),
    });
    // Rotate plane to be horizontal (facing up)
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.physicsWorld.addBody(this.groundBody);

    // Visual ground (large plane for distant terrain)
    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d, // Grass green
      roughness: 0.9,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);
  }

  private createSkybox(): void {
    // Simple gradient sky using a large sphere
    const skyGeometry = new THREE.SphereGeometry(4000, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private getChunkCoords(position: THREE.Vector3): { x: number; z: number } {
    return {
      x: Math.floor(position.x / this.config.chunkSize),
      z: Math.floor(position.z / this.config.chunkSize),
    };
  }

  private async loadChunksAroundPosition(position: THREE.Vector3): Promise<void> {
    const centerCoords = this.getChunkCoords(position);
    const chunksToLoad: { x: number; z: number }[] = [];

    const radius = Math.ceil(this.config.loadRadius / this.config.chunkSize);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const chunkX = centerCoords.x + dx;
        const chunkZ = centerCoords.z + dz;
        const key = this.getChunkKey(chunkX, chunkZ);

        if (!this.chunks.has(key) && !this.loadingChunks.has(key)) {
          // Check distance
          const chunkCenterX = (chunkX + 0.5) * this.config.chunkSize;
          const chunkCenterZ = (chunkZ + 0.5) * this.config.chunkSize;
          const distance = Math.sqrt(
            Math.pow(chunkCenterX - position.x, 2) + Math.pow(chunkCenterZ - position.z, 2)
          );

          if (distance < this.config.loadRadius) {
            chunksToLoad.push({ x: chunkX, z: chunkZ });
          }
        }
      }
    }

    // Load chunks
    await Promise.all(chunksToLoad.map((coords) => this.loadChunk(coords.x, coords.z)));
  }

  private async loadChunk(chunkX: number, chunkZ: number): Promise<void> {
    const key = this.getChunkKey(chunkX, chunkZ);
    if (this.chunks.has(key) || this.loadingChunks.has(key)) return;

    this.loadingChunks.add(key);

    const chunk = new TerrainChunk(
      chunkX,
      chunkZ,
      this.config.chunkSize,
      this.config.terrainScale
    );

    await chunk.generate();
    chunk.addToScene(this.scene);

    this.chunks.set(key, chunk);
    this.loadingChunks.delete(key);
  }

  private unloadDistantChunks(position: THREE.Vector3): void {
    const chunksToUnload: string[] = [];

    this.chunks.forEach((chunk, key) => {
      const chunkCenter = chunk.getCenter();
      const distance = Math.sqrt(
        Math.pow(chunkCenter.x - position.x, 2) + Math.pow(chunkCenter.z - position.z, 2)
      );

      if (distance > this.config.unloadRadius) {
        chunksToUnload.push(key);
      }
    });

    for (const key of chunksToUnload) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        chunk.removeFromScene(this.scene);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  public update(playerPosition: THREE.Vector3): void {
    // Load new chunks
    this.loadChunksAroundPosition(playerPosition);

    // Unload distant chunks
    this.unloadDistantChunks(playerPosition);

    // Update LOD for visible chunks
    this.chunks.forEach((chunk) => {
      const distance = chunk.getCenter().distanceTo(playerPosition);
      chunk.updateLOD(distance);
    });
  }

  public getHeightAt(x: number, z: number): number {
    const coords = this.getChunkCoords(new THREE.Vector3(x, 0, z));
    const key = this.getChunkKey(coords.x, coords.z);
    const chunk = this.chunks.get(key);

    if (chunk) {
      return chunk.getHeightAt(x, z);
    }

    return 0;
  }

  public dispose(): void {
    this.chunks.forEach((chunk) => {
      chunk.dispose();
    });
    this.chunks.clear();

    this.roadBuilder.dispose();
    this.environmentBuilder.dispose();

    if (this.groundBody) {
      this.physicsWorld.removeBody(this.groundBody);
    }
  }
}
