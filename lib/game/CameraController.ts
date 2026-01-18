import * as THREE from 'three';

export type CameraMode = 'chase' | 'cockpit' | 'orbit';

export interface CameraTarget {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  velocity: THREE.Vector3;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'chase';
  private target: CameraTarget | null = null;

  // Chase camera settings
  private chaseDistance = 8;
  private chaseHeight = 3;
  private chaseLookAhead = 2;
  private chaseSmoothness = 5;

  // Cockpit camera settings
  private cockpitOffset = new THREE.Vector3(0, 1.2, 0.3);

  // Orbit camera settings
  private orbitRadius = 15;
  private orbitAngle = 0;
  private orbitHeight = 5;

  // Smoothing
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private velocity = new THREE.Vector3();

  // Shake effect
  private shakeIntensity = 0;
  private shakeDecay = 5;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentPosition.copy(camera.position);
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public cycleMode(): void {
    const modes: CameraMode[] = ['chase', 'cockpit', 'orbit'];
    const currentIndex = modes.indexOf(this.mode);
    this.mode = modes[(currentIndex + 1) % modes.length];
  }

  public setTarget(target: CameraTarget): void {
    this.target = target;
  }

  public addShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public update(deltaTime: number): void {
    if (!this.target) return;

    // Decay shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * deltaTime);

    switch (this.mode) {
      case 'chase':
        this.updateChaseCamera(deltaTime);
        break;
      case 'cockpit':
        this.updateCockpitCamera(deltaTime);
        break;
      case 'orbit':
        this.updateOrbitCamera(deltaTime);
        break;
    }

    // Apply shake
    if (this.shakeIntensity > 0) {
      const shake = new THREE.Vector3(
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity,
        (Math.random() - 0.5) * this.shakeIntensity
      );
      this.camera.position.add(shake);
    }
  }

  private updateChaseCamera(deltaTime: number): void {
    if (!this.target) return;

    // Get forward direction from rotation
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(this.target.rotation);

    // Calculate speed for dynamic camera
    const speed = this.target.velocity.length() * 3.6; // to km/h
    const speedFactor = Math.min(1, speed / 150);

    // Dynamic distance and height based on speed
    const dynamicDistance = this.chaseDistance + speedFactor * 4;
    const dynamicHeight = this.chaseHeight + speedFactor * 1;

    // Target camera position (behind and above vehicle)
    const targetPosition = new THREE.Vector3()
      .copy(this.target.position)
      .add(forward.clone().multiplyScalar(-dynamicDistance))
      .add(new THREE.Vector3(0, dynamicHeight, 0));

    // Target look-at position (ahead of vehicle)
    const targetLookAt = new THREE.Vector3()
      .copy(this.target.position)
      .add(forward.clone().multiplyScalar(this.chaseLookAhead))
      .add(new THREE.Vector3(0, 1, 0));

    // Smooth camera movement
    const smoothFactor = 1 - Math.exp(-this.chaseSmoothness * deltaTime);
    this.currentPosition.lerp(targetPosition, smoothFactor);
    this.currentLookAt.lerp(targetLookAt, smoothFactor);

    // Apply to camera
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  private updateCockpitCamera(deltaTime: number): void {
    if (!this.target) return;

    // Position camera at cockpit location
    const offset = this.cockpitOffset.clone();
    offset.applyQuaternion(this.target.rotation);

    this.camera.position.copy(this.target.position).add(offset);
    this.camera.quaternion.copy(this.target.rotation);

    // Add slight pitch based on velocity for immersion
    const speed = this.target.velocity.length();
    const pitchAdjust = Math.min(0.1, speed * 0.001);
    this.camera.rotateX(-pitchAdjust);
  }

  private updateOrbitCamera(deltaTime: number): void {
    if (!this.target) return;

    // Auto-rotate orbit
    this.orbitAngle += deltaTime * 0.3;

    const x = this.target.position.x + Math.cos(this.orbitAngle) * this.orbitRadius;
    const y = this.target.position.y + this.orbitHeight;
    const z = this.target.position.z + Math.sin(this.orbitAngle) * this.orbitRadius;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target.position);
  }

  // For interpolated rendering
  public getInterpolatedPosition(interpolation: number): THREE.Vector3 {
    return this.currentPosition.clone();
  }
}
