import * as CANNON from 'cannon-es';
import { VehicleConfig, ARCADE_VEHICLE_CONFIG } from './VehicleConfig';

export interface VehicleInput {
  throttle: number; // -1 to 1
  steering: number; // -1 to 1
  brake: boolean;
  handbrake: boolean;
}

export interface VehicleState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  speed: number;
  rpm: number;
  gear: number;
  wheelStates: WheelState[];
}

export interface WheelState {
  rotation: number;
  suspensionLength: number;
  isInContact: boolean;
  contactPoint: { x: number; y: number; z: number } | null;
}

export class VehiclePhysics {
  public body: CANNON.Body;
  public vehicle: CANNON.RaycastVehicle;
  public config: VehicleConfig;

  private currentGear: number = 1;
  private currentRPM: number = 0;
  private readonly maxRPM: number = 8000;
  private readonly idleRPM: number = 800;
  private readonly gearRatios: number[] = [0, 3.5, 2.5, 1.8, 1.4, 1.1, 0.9];
  private readonly finalDrive: number = 3.5;

  constructor(world: CANNON.World, config: VehicleConfig = ARCADE_VEHICLE_CONFIG) {
    this.config = config;

    // Create chassis body
    const chassisShape = new CANNON.Box(
      new CANNON.Vec3(
        config.chassisWidth / 2,
        config.chassisHeight / 2,
        config.chassisLength / 2
      )
    );

    this.body = new CANNON.Body({
      mass: config.chassisMass,
      material: new CANNON.Material('chassis'),
    });
    this.body.addShape(chassisShape);
    this.body.position.set(0, 2, 0);
    this.body.angularDamping = 0.4;

    // Create vehicle
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.body,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    // Add wheels
    this.addWheels();

    // Add chassis body to world first
    world.addBody(this.body);

    // Add vehicle (wheels and constraints) to world
    this.vehicle.addToWorld(world);
  }

  private addWheels(): void {
    const wheelOptions = {
      radius: this.config.wheel.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: this.config.wheel.suspensionStiffness,
      suspensionRestLength: this.config.wheel.suspensionRestLength,
      frictionSlip: this.config.wheel.frictionSlip,
      dampingRelaxation: this.config.wheel.dampingRelaxation,
      dampingCompression: this.config.wheel.dampingCompression,
      maxSuspensionForce: this.config.wheel.maxSuspensionForce,
      rollInfluence: this.config.wheel.rollInfluence,
      axleLocal: new CANNON.Vec3(1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: this.config.wheel.maxSuspensionTravel,
      customSlidingRotationalSpeed: this.config.wheel.customSlidingRotationalSpeed,
      useCustomSlidingRotationalSpeed: this.config.wheel.useCustomSlidingRotationalSpeed,
    };

    const wheelPositions = [
      // Front left
      new CANNON.Vec3(
        -this.config.wheelTrack,
        this.config.wheelHeight,
        this.config.frontWheelOffset
      ),
      // Front right
      new CANNON.Vec3(
        this.config.wheelTrack,
        this.config.wheelHeight,
        this.config.frontWheelOffset
      ),
      // Rear left
      new CANNON.Vec3(
        -this.config.wheelTrack,
        this.config.wheelHeight,
        this.config.rearWheelOffset
      ),
      // Rear right
      new CANNON.Vec3(
        this.config.wheelTrack,
        this.config.wheelHeight,
        this.config.rearWheelOffset
      ),
    ];

    for (const position of wheelPositions) {
      wheelOptions.chassisConnectionPointLocal = position;
      this.vehicle.addWheel(wheelOptions);
    }
  }

  public applyInput(input: VehicleInput, deltaTime: number): void {
    const speed = this.getSpeed();
    const maxForce = this.config.maxForce;
    const maxBrakeForce = this.config.maxBrakeForce;
    const maxSteer = this.config.maxSteerAngle;

    // Speed-sensitive steering (negated for correct direction)
    const steerFactor = Math.max(0.3, 1 - (speed / 200) * 0.7);
    const targetSteer = -input.steering * maxSteer * steerFactor;

    // Apply steering to front wheels
    this.vehicle.setSteeringValue(targetSteer, 0);
    this.vehicle.setSteeringValue(targetSteer, 1);

    // Calculate engine force based on gear and RPM
    const engineForce = this.calculateEngineForce(input.throttle, speed);

    // Apply engine force to rear wheels (RWD) - negated for correct direction
    this.vehicle.applyEngineForce(-engineForce, 2);
    this.vehicle.applyEngineForce(-engineForce, 3);

    // Braking
    if (input.brake) {
      for (let i = 0; i < 4; i++) {
        this.vehicle.setBrake(maxBrakeForce, i);
      }
    } else if (input.handbrake) {
      // Handbrake only affects rear wheels
      this.vehicle.setBrake(0, 0);
      this.vehicle.setBrake(0, 1);
      this.vehicle.setBrake(maxBrakeForce * 2, 2);
      this.vehicle.setBrake(maxBrakeForce * 2, 3);
      // Reduce rear grip for drifting
      this.vehicle.wheelInfos[2].frictionSlip = this.config.wheel.frictionSlip * 0.5;
      this.vehicle.wheelInfos[3].frictionSlip = this.config.wheel.frictionSlip * 0.5;
    } else {
      for (let i = 0; i < 4; i++) {
        this.vehicle.setBrake(0, i);
      }
      // Restore rear grip
      this.vehicle.wheelInfos[2].frictionSlip = this.config.wheel.frictionSlip;
      this.vehicle.wheelInfos[3].frictionSlip = this.config.wheel.frictionSlip;
    }

    // Update RPM and auto-shift
    this.updateRPMAndGear(input.throttle, speed, deltaTime);
  }

  private calculateEngineForce(throttle: number, speed: number): number {
    if (throttle === 0) return 0;

    const maxForce = this.config.maxForce;
    const gearRatio = this.gearRatios[this.currentGear] || 1;

    // Simple torque curve
    const rpmNormalized = (this.currentRPM - this.idleRPM) / (this.maxRPM - this.idleRPM);
    const torqueCurve = Math.sin(rpmNormalized * Math.PI * 0.8 + 0.2) * 0.8 + 0.2;

    let force = throttle * maxForce * torqueCurve * gearRatio / this.finalDrive;

    // Reverse
    if (throttle < 0 && speed < 5) {
      this.currentGear = -1;
      force = throttle * maxForce * 0.5;
    } else if (this.currentGear === -1 && throttle > 0) {
      this.currentGear = 1;
    }

    return force;
  }

  private updateRPMAndGear(throttle: number, speed: number, deltaTime: number): void {
    if (this.currentGear === -1) {
      this.currentRPM = Math.min(this.idleRPM + Math.abs(throttle) * 3000, this.maxRPM);
      return;
    }

    const gearRatio = this.gearRatios[this.currentGear] || 1;
    const wheelRPM = (speed / (2 * Math.PI * this.config.wheel.radius)) * 60;
    const targetRPM = wheelRPM * gearRatio * this.finalDrive;

    // Smooth RPM transition
    const rpmDelta = targetRPM - this.currentRPM;
    this.currentRPM += rpmDelta * Math.min(1, deltaTime * 10);

    // Idle RPM
    if (throttle > 0 && this.currentRPM < this.idleRPM) {
      this.currentRPM = this.idleRPM + throttle * 2000;
    } else if (this.currentRPM < this.idleRPM) {
      this.currentRPM = this.idleRPM;
    }

    // Auto upshift
    if (this.currentRPM > this.maxRPM * 0.9 && this.currentGear < this.gearRatios.length - 1) {
      this.currentGear++;
    }
    // Auto downshift
    else if (this.currentRPM < this.maxRPM * 0.3 && this.currentGear > 1) {
      this.currentGear--;
    }

    // Clamp RPM
    this.currentRPM = Math.max(this.idleRPM, Math.min(this.currentRPM, this.maxRPM));
  }

  public getSpeed(): number {
    const velocity = this.body.velocity;
    return Math.sqrt(velocity.x ** 2 + velocity.z ** 2) * 3.6; // m/s to km/h
  }

  public getState(): VehicleState {
    const position = this.body.position;
    const rotation = this.body.quaternion;
    const velocity = this.body.velocity;
    const angularVelocity = this.body.angularVelocity;

    const wheelStates: WheelState[] = this.vehicle.wheelInfos.map((wheel) => ({
      rotation: wheel.rotation,
      suspensionLength: wheel.suspensionLength,
      isInContact: wheel.isInContact,
      contactPoint: wheel.raycastResult.hitPointWorld
        ? {
            x: wheel.raycastResult.hitPointWorld.x,
            y: wheel.raycastResult.hitPointWorld.y,
            z: wheel.raycastResult.hitPointWorld.z,
          }
        : null,
    }));

    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      angularVelocity: {
        x: angularVelocity.x,
        y: angularVelocity.y,
        z: angularVelocity.z,
      },
      speed: this.getSpeed(),
      rpm: this.currentRPM,
      gear: this.currentGear,
      wheelStates,
    };
  }

  public setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
  }

  public setRotation(x: number, y: number, z: number, w: number): void {
    this.body.quaternion.set(x, y, z, w);
  }

  public reset(x: number, y: number, z: number, rotationY: number = 0): void {
    this.setPosition(x, y, z);
    const q = new CANNON.Quaternion();
    q.setFromEuler(0, rotationY, 0);
    this.body.quaternion.copy(q);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.currentGear = 1;
    this.currentRPM = this.idleRPM;
  }
}
