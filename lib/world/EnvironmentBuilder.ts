import * as THREE from 'three';

export class EnvironmentBuilder {
  private scene: THREE.Scene;
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public populateEnvironment(): void {
    this.createTrees();
    this.createRocks();
    this.createGrandstands();
  }

  private createTrees(): void {
    const treeCount = 500;

    // Create low-poly tree geometry
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
    const foliageGeometry = new THREE.ConeGeometry(1.5, 3, 6);

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
    });

    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.8,
      flatShading: true,
    });

    // Create instanced meshes
    const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
    const foliageMesh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeCount);

    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < treeCount; i++) {
      // Random position (avoid track area)
      let x, z;
      do {
        x = (Math.random() - 0.5) * 800;
        z = (Math.random() - 0.5) * 800;
      } while (this.isNearTrack(x, z));

      const scale = 0.8 + Math.random() * 0.6;

      // Trunk
      dummy.position.set(x, 1, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      // Foliage
      dummy.position.set(x, 3.5 * scale, z);
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(i, dummy.matrix);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;

    this.scene.add(trunkMesh);
    this.scene.add(foliageMesh);
    this.instancedMeshes.push(trunkMesh, foliageMesh);
  }

  private createRocks(): void {
    const rockCount = 200;

    // Create low-poly rock geometry
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.9,
      flatShading: true,
    });

    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < rockCount; i++) {
      let x, z;
      do {
        x = (Math.random() - 0.5) * 600;
        z = (Math.random() - 0.5) * 600;
      } while (this.isNearTrack(x, z));

      const scale = 0.3 + Math.random() * 1.5;

      dummy.position.set(x, scale * 0.3, z);
      dummy.scale.set(scale, scale * 0.6, scale);
      dummy.rotation.set(
        Math.random() * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * 0.3
      );
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    }

    rockMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(rockMesh);
    this.instancedMeshes.push(rockMesh);
  }

  private createGrandstands(): void {
    // Create grandstand near start/finish line
    const standGeometry = new THREE.BoxGeometry(30, 8, 10);
    const standMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.7,
    });

    const stand1 = new THREE.Mesh(standGeometry, standMaterial);
    stand1.position.set(-25, 4, 0);
    stand1.castShadow = true;
    stand1.receiveShadow = true;
    this.scene.add(stand1);

    // Seats (colored rows)
    const seatColors = [0xff0000, 0x0000ff, 0xffff00];
    for (let row = 0; row < 3; row++) {
      const seatGeom = new THREE.BoxGeometry(28, 1, 2);
      const seatMat = new THREE.MeshStandardMaterial({
        color: seatColors[row],
      });
      const seats = new THREE.Mesh(seatGeom, seatMat);
      seats.position.set(-25, 1 + row * 2.5, 3 - row * 2);
      this.scene.add(seats);
    }

    // Banner
    const bannerGeom = new THREE.PlaneGeometry(20, 3);
    const bannerMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(-25, 10, -3);
    this.scene.add(banner);
  }

  private isNearTrack(x: number, z: number): boolean {
    // Simple check - avoid center area where track is
    const distFromCenter = Math.sqrt(x * x + z * z);
    return distFromCenter < 200;
  }

  public dispose(): void {
    this.instancedMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.instancedMeshes = [];
  }
}
