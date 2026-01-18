import * as THREE from 'three';

const SKID_COLOR = 0x1a1a2e; // Dark pixel color

export class SkidMarkManager {
  private scene: THREE.Scene;
  private marks: THREE.Mesh[] = [];
  private maxMarks: number;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, maxMarks: number = 200) {
    this.scene = scene;
    this.maxMarks = maxMarks;

    // Create reusable geometry and material
    this.geometry = new THREE.PlaneGeometry(0.3, 0.8);
    this.material = new THREE.MeshBasicMaterial({
      color: SKID_COLOR,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
  }

  public addMark(position: THREE.Vector3, rotation: number): void {
    const mark = new THREE.Mesh(this.geometry, this.material.clone());
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = rotation;
    mark.position.copy(position);
    mark.position.y = 0.02; // Just above ground

    this.scene.add(mark);
    this.marks.push(mark);

    // Remove oldest marks if over limit
    if (this.marks.length > this.maxMarks) {
      const old = this.marks.shift();
      if (old) {
        this.scene.remove(old);
        (old.material as THREE.Material).dispose();
      }
    }
  }

  public addSkidPair(
    leftWheelPos: THREE.Vector3,
    rightWheelPos: THREE.Vector3,
    rotation: number
  ): void {
    this.addMark(leftWheelPos, rotation);
    this.addMark(rightWheelPos, rotation);
  }

  public clear(): void {
    for (const mark of this.marks) {
      this.scene.remove(mark);
      (mark.material as THREE.Material).dispose();
    }
    this.marks = [];
  }

  public dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
