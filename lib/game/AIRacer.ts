import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { AIController, AIPersonality } from '@/lib/shared/game/AIController';
import { VehicleState } from '@/lib/shared/physics/VehiclePhysics';
import { TrackWaypoint } from './TrackBuilder';

// F1 Team colors for AI cars
const AI_CAR_COLORS = [
  0x2563eb, // Williams/Alpine Blue
  0xea580c, // McLaren Orange
  0x0d9488, // Aston Martin Teal
  0xfbbf24, // Renault Yellow
];

export interface AIRacerState {
  position: { x: number; z: number };
  rotation: number;
  speed: number;
  lap: number;
  waypointIndex: number;
}

export class AIRacer {
  public mesh: THREE.Group;
  public body: CANNON.Body;
  public aiController: AIController;

  private personality: AIPersonality;
  private carSpeed: number = 0;
  private carRotation: number;
  private lap: number = 1;
  private lastZ: number = 0;
  private crossedFinishLine: boolean = false;
  private wheelMeshes: THREE.Mesh[] = [];

  private readonly maxSpeed: number;
  private readonly acceleration = 18;
  private readonly brakeForce = 25;
  private readonly friction = 5;
  private readonly turnSpeed = 2.5;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    waypoints: TrackWaypoint[],
    startPos: { x: number; z: number; rotation: number },
    personality: AIPersonality,
    colorIndex: number,
    carMaterial: CANNON.Material
  ) {
    this.personality = personality;
    this.carRotation = startPos.rotation;

    // Set max speed based on personality
    switch (personality) {
      case 'aggressive':
        this.maxSpeed = 52;
        break;
      case 'balanced':
        this.maxSpeed = 48;
        break;
      case 'defensive':
        this.maxSpeed = 44;
        break;
      case 'rookie':
        this.maxSpeed = 38;
        break;
      default:
        this.maxSpeed = 45;
    }

    // Create AI controller
    this.aiController = new AIController(
      waypoints.map((w) => ({ ...w, y: 0.5 })),
      personality
    );

    // Create physics body
    const carShape = new CANNON.Box(new CANNON.Vec3(1, 0.4, 2));
    this.body = new CANNON.Body({
      mass: 500,
      shape: carShape,
      material: carMaterial,
      linearDamping: 0.5,
      angularDamping: 0.8,
    });
    this.body.position.set(startPos.x, 0.75, startPos.z);
    this.body.quaternion.setFromEuler(0, startPos.rotation, 0);
    world.addBody(this.body);

    // Create visual mesh
    this.mesh = this.createCarMesh(AI_CAR_COLORS[colorIndex % AI_CAR_COLORS.length]);
    this.mesh.position.set(startPos.x, 0.75, startPos.z);
    this.mesh.rotation.y = startPos.rotation;
    scene.add(this.mesh);

    this.lastZ = startPos.z;
  }

  private createCarMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    // Body - team color with matte finish
    const bodyGeo = new THREE.BoxGeometry(2, 0.6, 4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);

    // Cabin - dark charcoal
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.5, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x262626,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.75, -0.3);
    cabin.castShadow = true;
    group.add(cabin);

    // Wheels - dark
    const wheelGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x262626,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    const wheelPositions = [
      { x: -1.1, y: -0.2, z: 1.3 },
      { x: 1.1, y: -0.2, z: 1.3 },
      { x: -1.1, y: -0.2, z: -1.3 },
      { x: 1.1, y: -0.2, z: -1.3 },
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = true;
      group.add(wheel);
      this.wheelMeshes.push(wheel);
    });

    return group;
  }

  public update(deltaTime: number, obstacles: VehicleState[]): void {
    // Get current state for AI
    const state: VehicleState = {
      position: {
        x: this.body.position.x,
        y: this.body.position.y,
        z: this.body.position.z,
      },
      rotation: {
        x: this.body.quaternion.x,
        y: this.body.quaternion.y,
        z: this.body.quaternion.z,
        w: this.body.quaternion.w,
      },
      velocity: {
        x: Math.sin(this.carRotation) * this.carSpeed,
        y: 0,
        z: Math.cos(this.carRotation) * this.carSpeed,
      },
      angularVelocity: { x: 0, y: 0, z: 0 },
      speed: Math.abs(this.carSpeed) * 3.6,
      rpm: 3000,
      gear: 3,
      wheelStates: [],
    };

    // Get AI input
    const input = this.aiController.update(state, deltaTime, obstacles);

    // Apply physics
    if (input.throttle > 0) {
      this.carSpeed = Math.min(
        this.carSpeed + this.acceleration * input.throttle * deltaTime,
        this.maxSpeed
      );
    } else if (input.brake || input.throttle < 0) {
      this.carSpeed = Math.max(this.carSpeed - this.brakeForce * deltaTime, 0);
    } else {
      if (this.carSpeed > 0) {
        this.carSpeed = Math.max(this.carSpeed - this.friction * deltaTime, 0);
      }
    }

    // Steering
    if (Math.abs(this.carSpeed) > 0.5) {
      const speedFactor = Math.max(0.3, 1 - (Math.abs(this.carSpeed) / this.maxSpeed) * 0.7);
      const steerAmount =
        input.steering * this.turnSpeed * speedFactor * deltaTime * (this.carSpeed > 0 ? 1 : -1);
      this.carRotation -= steerAmount;
    }

    // Update position
    const forwardX = Math.sin(this.carRotation);
    const forwardZ = Math.cos(this.carRotation);

    this.body.position.x += forwardX * this.carSpeed * deltaTime;
    this.body.position.z += forwardZ * this.carSpeed * deltaTime;
    this.body.position.y = 0.75;
    this.body.quaternion.setFromEuler(0, this.carRotation, 0);

    // Sync visual with physics
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);

    // Animate wheels
    const wheelRotation = this.carSpeed * deltaTime * 5;
    this.wheelMeshes.forEach((wheel) => {
      wheel.rotation.x += wheelRotation;
    });

    // Lap tracking
    this.trackLap();
  }

  private trackLap(): void {
    const currentZ = this.body.position.z;
    const currentX = this.body.position.x;

    // Check if near finish line (at z=-10, x=0)
    if (Math.abs(currentX) < 10) {
      if (this.lastZ < -10 && currentZ >= -10 && !this.crossedFinishLine) {
        this.crossedFinishLine = true;
        this.lap++;
      } else if (currentZ < -30) {
        this.crossedFinishLine = false;
      }
    }
    this.lastZ = currentZ;
  }

  public getState(): AIRacerState {
    return {
      position: { x: this.body.position.x, z: this.body.position.z },
      rotation: this.carRotation,
      speed: Math.abs(this.carSpeed) * 3.6,
      lap: this.lap,
      waypointIndex: this.aiController.getCurrentWaypointIndex(),
    };
  }

  public getVehicleState(): VehicleState {
    return {
      position: {
        x: this.body.position.x,
        y: this.body.position.y,
        z: this.body.position.z,
      },
      rotation: {
        x: this.body.quaternion.x,
        y: this.body.quaternion.y,
        z: this.body.quaternion.z,
        w: this.body.quaternion.w,
      },
      velocity: {
        x: Math.sin(this.carRotation) * this.carSpeed,
        y: 0,
        z: Math.cos(this.carRotation) * this.carSpeed,
      },
      angularVelocity: { x: 0, y: 0, z: 0 },
      speed: Math.abs(this.carSpeed) * 3.6,
      rpm: 3000,
      gear: 3,
      wheelStates: [],
    };
  }

  public getLap(): number {
    return this.lap;
  }

  public reset(startPos: { x: number; z: number; rotation: number }): void {
    this.body.position.set(startPos.x, 0.75, startPos.z);
    this.body.quaternion.setFromEuler(0, startPos.rotation, 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.carSpeed = 0;
    this.carRotation = startPos.rotation;
    this.lap = 1;
    this.crossedFinishLine = false;
    this.lastZ = startPos.z;

    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }

  public dispose(scene: THREE.Scene, world: CANNON.World): void {
    scene.remove(this.mesh);
    world.removeBody(this.body);
  }
}
