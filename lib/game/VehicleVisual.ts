import * as THREE from 'three';
import { WheelState } from '../shared/physics/VehiclePhysics';

export class VehicleVisual {
  private scene: THREE.Scene;
  private chassisGroup: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private wheelRadius = 0.35;

  constructor(scene: THREE.Scene, color: number = 0xff6600) {
    this.scene = scene;
    this.chassisGroup = new THREE.Group();

    // Create low-poly car chassis
    this.createChassis(color);

    // Create wheels
    this.createWheels();

    scene.add(this.chassisGroup);
  }

  private createChassis(color: number): void {
    // Main body (box)
    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.5, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.6,
      roughness: 0.4,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.4;
    body.castShadow = true;
    body.receiveShadow = true;
    this.chassisGroup.add(body);

    // Cabin (smaller box on top)
    const cabinGeometry = new THREE.BoxGeometry(1.4, 0.4, 1.8);
    const cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.3,
      roughness: 0.7,
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0, 0.85, -0.2);
    cabin.castShadow = true;
    this.chassisGroup.add(cabin);

    // Front hood slope
    const hoodGeometry = new THREE.BoxGeometry(1.6, 0.3, 0.8);
    const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
    hood.position.set(0, 0.55, 1.2);
    hood.rotation.x = -0.15;
    hood.castShadow = true;
    this.chassisGroup.add(hood);

    // Rear spoiler
    const spoilerGeometry = new THREE.BoxGeometry(1.6, 0.05, 0.3);
    const spoiler = new THREE.Mesh(spoilerGeometry, bodyMaterial);
    spoiler.position.set(0, 1, -1.8);
    spoiler.castShadow = true;
    this.chassisGroup.add(spoiler);

    // Spoiler supports
    const supportGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
    const leftSupport = new THREE.Mesh(supportGeometry, bodyMaterial);
    leftSupport.position.set(-0.6, 0.85, -1.8);
    this.chassisGroup.add(leftSupport);

    const rightSupport = new THREE.Mesh(supportGeometry, bodyMaterial);
    rightSupport.position.set(0.6, 0.85, -1.8);
    this.chassisGroup.add(rightSupport);

    // Headlights
    const lightGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.05);
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffffcc,
      emissiveIntensity: 0.5,
    });

    const leftLight = new THREE.Mesh(lightGeometry, lightMaterial);
    leftLight.position.set(-0.55, 0.45, 1.98);
    this.chassisGroup.add(leftLight);

    const rightLight = new THREE.Mesh(lightGeometry, lightMaterial);
    rightLight.position.set(0.55, 0.45, 1.98);
    this.chassisGroup.add(rightLight);

    // Taillights
    const tailLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.3,
    });

    const leftTail = new THREE.Mesh(lightGeometry, tailLightMaterial);
    leftTail.position.set(-0.55, 0.45, -1.98);
    this.chassisGroup.add(leftTail);

    const rightTail = new THREE.Mesh(lightGeometry, tailLightMaterial);
    rightTail.position.set(0.55, 0.45, -1.98);
    this.chassisGroup.add(rightTail);
  }

  private createWheels(): void {
    const wheelGeometry = new THREE.CylinderGeometry(
      this.wheelRadius,
      this.wheelRadius,
      0.25,
      16
    );
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.3,
      roughness: 0.8,
    });

    // Wheel positions (local to chassis)
    const wheelPositions = [
      new THREE.Vector3(-0.9, 0, 1.5), // Front left
      new THREE.Vector3(0.9, 0, 1.5), // Front right
      new THREE.Vector3(-0.9, 0, -1.3), // Rear left
      new THREE.Vector3(0.9, 0, -1.3), // Rear right
    ];

    for (let i = 0; i < 4; i++) {
      const wheelGroup = new THREE.Group();

      // Wheel (tire)
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelGroup.add(wheel);

      // Rim
      const rimGeometry = new THREE.CylinderGeometry(
        this.wheelRadius * 0.6,
        this.wheelRadius * 0.6,
        0.27,
        8
      );
      const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.8,
        roughness: 0.2,
      });
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      wheelGroup.position.copy(wheelPositions[i]);
      this.chassisGroup.add(wheelGroup);
      this.wheels.push(wheel);
    }
  }

  public update(
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    wheelStates: WheelState[]
  ): void {
    this.chassisGroup.position.copy(position);
    this.chassisGroup.quaternion.copy(rotation);

    // Update wheel rotations
    for (let i = 0; i < this.wheels.length && i < wheelStates.length; i++) {
      const wheel = this.wheels[i];
      const state = wheelStates[i];

      // Wheel spin
      wheel.rotation.x = state.rotation;

      // Front wheels steering
      if (i < 2) {
        // Will be handled by parent group if we add steering visually
      }
    }
  }

  public setPosition(position: THREE.Vector3): void {
    this.chassisGroup.position.copy(position);
  }

  public setRotation(rotation: THREE.Quaternion): void {
    this.chassisGroup.quaternion.copy(rotation);
  }

  public getPosition(): THREE.Vector3 {
    return this.chassisGroup.position.clone();
  }

  public dispose(): void {
    this.scene.remove(this.chassisGroup);

    this.chassisGroup.traverse((object) => {
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
}
