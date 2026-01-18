import * as THREE from 'three';

export class TerrainChunk {
  private chunkX: number;
  private chunkZ: number;
  private size: number;
  private heightScale: number;

  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.Material | null = null;

  private heightData: Float32Array | null = null;
  private resolution: number = 64;
  private currentLOD: number = 0;

  constructor(chunkX: number, chunkZ: number, size: number, heightScale: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.size = size;
    this.heightScale = heightScale;
  }

  public async generate(): Promise<void> {
    // Generate height data using simplex noise (simplified version)
    this.heightData = this.generateHeightData();

    // Create geometry
    this.geometry = this.createGeometry(this.resolution);

    // Create material
    this.material = new THREE.MeshStandardMaterial({
      color: 0x4a7c4e, // Grass color
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true, // Low-poly look
    });

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(
      this.chunkX * this.size,
      0,
      this.chunkZ * this.size
    );
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }

  private generateHeightData(): Float32Array {
    const data = new Float32Array((this.resolution + 1) * (this.resolution + 1));

    for (let z = 0; z <= this.resolution; z++) {
      for (let x = 0; x <= this.resolution; x++) {
        const worldX = this.chunkX * this.size + (x / this.resolution) * this.size;
        const worldZ = this.chunkZ * this.size + (z / this.resolution) * this.size;

        // Simple procedural height generation
        // In production, use proper simplex/perlin noise
        const height = this.sampleNoise(worldX, worldZ);

        // Flatten areas near roads (center of track)
        const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
        const roadInfluence = Math.max(0, 1 - distFromCenter / 300);
        const flattenedHeight = height * (1 - roadInfluence * 0.9);

        data[z * (this.resolution + 1) + x] = flattenedHeight * this.heightScale;
      }
    }

    return data;
  }

  private sampleNoise(x: number, z: number): number {
    // Simplified noise function (replace with proper noise library in production)
    const scale1 = 0.005;
    const scale2 = 0.02;
    const scale3 = 0.05;

    // Multiple octaves of "noise" using sin
    const n1 = Math.sin(x * scale1) * Math.cos(z * scale1) * 0.5 + 0.5;
    const n2 = Math.sin(x * scale2 + 1.5) * Math.cos(z * scale2 + 2.3) * 0.25 + 0.25;
    const n3 = Math.sin(x * scale3 + 4.2) * Math.cos(z * scale3 + 1.7) * 0.125 + 0.125;

    return (n1 + n2 + n3) / 3;
  }

  private createGeometry(resolution: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const segmentSize = this.size / resolution;

    // Generate vertices
    for (let z = 0; z <= resolution; z++) {
      for (let x = 0; x <= resolution; x++) {
        const xPos = x * segmentSize;
        const zPos = z * segmentSize;
        const height = this.heightData
          ? this.heightData[z * (this.resolution + 1) + x]
          : 0;

        vertices.push(xPos, height, zPos);
        uvs.push(x / resolution, z / resolution);
      }
    }

    // Generate indices
    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const topLeft = z * (resolution + 1) + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * (resolution + 1) + x;
        const bottomRight = bottomLeft + 1;

        // Two triangles per quad
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  public updateLOD(distance: number): void {
    // Determine LOD level based on distance
    let targetLOD = 0;
    if (distance > 800) targetLOD = 4;
    else if (distance > 500) targetLOD = 3;
    else if (distance > 300) targetLOD = 2;
    else if (distance > 150) targetLOD = 1;

    if (targetLOD !== this.currentLOD) {
      this.currentLOD = targetLOD;
      // In production, regenerate geometry at lower resolution
      // For now, we keep the same geometry
    }
  }

  public addToScene(scene: THREE.Scene): void {
    if (this.mesh) {
      scene.add(this.mesh);
    }
  }

  public removeFromScene(scene: THREE.Scene): void {
    if (this.mesh) {
      scene.remove(this.mesh);
    }
  }

  public getCenter(): THREE.Vector3 {
    return new THREE.Vector3(
      (this.chunkX + 0.5) * this.size,
      0,
      (this.chunkZ + 0.5) * this.size
    );
  }

  public getHeightAt(worldX: number, worldZ: number): number {
    if (!this.heightData) return 0;

    const localX = worldX - this.chunkX * this.size;
    const localZ = worldZ - this.chunkZ * this.size;

    const gridX = (localX / this.size) * this.resolution;
    const gridZ = (localZ / this.size) * this.resolution;

    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = Math.min(x0 + 1, this.resolution);
    const z1 = Math.min(z0 + 1, this.resolution);

    const fx = gridX - x0;
    const fz = gridZ - z0;

    // Bilinear interpolation
    const h00 = this.heightData[z0 * (this.resolution + 1) + x0];
    const h10 = this.heightData[z0 * (this.resolution + 1) + x1];
    const h01 = this.heightData[z1 * (this.resolution + 1) + x0];
    const h11 = this.heightData[z1 * (this.resolution + 1) + x1];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;

    return h0 * (1 - fz) + h1 * fz;
  }

  public dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      if (Array.isArray(this.material)) {
        this.material.forEach((m) => m.dispose());
      } else {
        this.material.dispose();
      }
    }
    this.heightData = null;
  }
}
