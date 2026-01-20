import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Engine } from './Engine';
import { GameLoop } from './GameLoop';
import { InputManager } from '@/lib/input/InputManager';
import { TrackBuilder, TrackBuilderOptions, TrackWaypoint, MinimapData } from './TrackBuilder';
export type { MinimapData } from './TrackBuilder';
export type { TrackWaypoint } from './TrackBuilder';
import { SkidMarkManager } from './SkidMarkManager';
import { AIRacer } from './AIRacer';
import { VehicleState } from '@/lib/shared/physics/VehiclePhysics';
import { AIPersonality } from '@/lib/shared/game/AIController';

export type GameMode = 'time-trial' | 'race';

export interface RaceResults {
  totalTime: number;
  bestLapTime: number;
  lapTimes: number[];
  totalLaps: number;
  position?: number;
}

export interface CustomTrackData {
  waypoints: TrackWaypoint[];
  startPosition: { x: number; z: number; rotation: number };
  id?: string;
}

export interface GameOptions {
  gameMode?: GameMode;
  customTrack?: CustomTrackData;
  onProgressUpdate?: (progress: number, message: string) => void;
  onGameStateUpdate?: (state: GameState) => void;
  onPause?: () => void;
  onRaceComplete?: (results: RaceResults) => void;
}

export interface GameState {
  speed: number;
  rpm: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  lapTime: number;
  bestLapTime: number;
  carX: number;
  carZ: number;
  carRotation: number;
}

// F1 Professional Racing color palette
const PIXEL_COLORS = {
  black: 0x171717,    // Carbon black - player car body
  dark: 0x262626,     // Charcoal - wheels
  mid: 0x404040,      // Slate
  light: 0x737373,    // Inactive
  red: 0xdc2626,      // Racing red - player accent
  orange: 0xea580c,   // McLaren orange
  yellow: 0xfbbf24,   // Headlights
  green: 0x0d9488,    // Teal
  cyan: 0x525252,     // Neutral
  blue: 0x2563eb,     // Williams blue
  purple: 0x525252,   // Neutral
  pink: 0xdc2626,     // Same as red
  white: 0xffffff,    // Pure white
  gray: 0xa3a3a3,     // Chrome silver
};

export class Game {
  private container: HTMLElement;
  private options: GameOptions;
  private gameMode: GameMode;

  private engine!: Engine;
  private gameLoop!: GameLoop;
  private inputManager!: InputManager;

  // Physics
  private world!: CANNON.World;
  private carBody!: CANNON.Body;
  private carMaterial!: CANNON.Material;
  private barrierMaterial!: CANNON.Material;

  // Track
  private trackBuilder!: TrackBuilder;
  private waypoints: TrackWaypoint[] = [];
  private startPosition = { x: 0, z: 0, rotation: 0 };

  // Visuals
  private carMesh!: THREE.Group;
  private wheelMeshes: THREE.Mesh[] = [];
  private skidMarkManager!: SkidMarkManager;

  // AI Racers
  private aiRacers: AIRacer[] = [];
  private readonly AI_COUNT = 3;

  // Camera smoothing
  private cameraTarget = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();

  private isPaused = false;
  private isInitialized = false;
  private gameState: GameState;

  // Car physics
  private carSpeed = 0;
  private carRotation = 0;
  private readonly maxSpeed = 55;
  private readonly acceleration = 20;
  private readonly brakeForce = 30;
  private readonly friction = 5;
  private readonly turnSpeed = 2.5;

  // Lap tracking
  private lapStartTime = 0;
  private raceStartTime = 0;
  private lastZ = 0;
  private crossedFinishLine = false;
  private lapTimes: number[] = [];
  private raceComplete = false;
  private currentLap = 1;
  private bestLapTime = 0;
  private racePosition = 1;
  private raceStarted = false; // Timer doesn't start until player moves

  // Throttle UI updates
  private lastUIUpdate = 0;
  private readonly UI_UPDATE_INTERVAL = 16;

  // Skid detection
  private lastSkidTime = 0;
  private readonly SKID_INTERVAL = 50;

  constructor(container: HTMLElement, options: GameOptions = {}) {
    this.container = container;
    this.options = options;
    this.gameMode = options.gameMode || 'time-trial';

    const totalRacers = this.gameMode === 'race' ? this.AI_COUNT + 1 : 1;
    this.gameState = {
      speed: 0,
      rpm: 800,
      gear: 1,
      lap: 1,
      totalLaps: 3,
      position: 1,
      totalRacers,
      lapTime: 0,
      bestLapTime: 0,
      carX: 0,
      carZ: 0,
      carRotation: 0,
    };
  }

  public async init(): Promise<void> {
    try {
      this.reportProgress(0, 'INITIALIZING...');

      // Initialize Three.js
      this.engine = new Engine({
        container: this.container,
        antialias: false,
      });
      this.reportProgress(15, 'ENGINE READY');

      // Initialize physics
      this.initPhysics();
      this.reportProgress(30, 'PHYSICS READY');

      // Build track (custom or default)
      const trackBuilderOptions: TrackBuilderOptions = {};
      if (this.options.customTrack) {
        trackBuilderOptions.customWaypoints = this.options.customTrack.waypoints;
        trackBuilderOptions.customStartPosition = this.options.customTrack.startPosition;
      }

      this.trackBuilder = new TrackBuilder(this.engine.scene, this.world, trackBuilderOptions);
      const trackData = this.trackBuilder.build();
      this.waypoints = trackData.waypoints;
      this.startPosition = this.trackBuilder.getStartPosition();
      this.barrierMaterial = this.trackBuilder.getBarrierMaterial();
      this.reportProgress(50, 'TRACK READY');

      // Setup collision materials
      this.setupCollisionMaterials();

      // Create player car
      this.createVoxelCar();
      this.reportProgress(65, 'CAR READY');

      // Create skid mark manager
      this.skidMarkManager = new SkidMarkManager(this.engine.scene);

      // Create AI racers if in race mode
      if (this.gameMode === 'race') {
        this.createAIRacers();
      }
      this.reportProgress(80, 'AI READY');

      // Initialize input
      this.inputManager = new InputManager();

      // Initialize game loop
      this.gameLoop = new GameLoop();
      this.gameLoop.onUpdate((dt) => this.update(dt));
      this.gameLoop.onRender(() => this.render());

      // Initialize lap tracking - timer starts when player first moves
      this.lapStartTime = 0;
      this.raceStartTime = 0;
      this.raceStarted = false;
      // Initialize lastZ to a positive value so car must complete a full lap first
      // (lastZ is repurposed as forward distance from finish line)
      this.lastZ = 5;
      this.lapTimes = [];
      this.raceComplete = false;

      // Start
      this.gameLoop.start();
      this.isInitialized = true;
      this.reportProgress(100, 'READY!');
    } catch (error) {
      console.error('Failed to initialize game:', error);
      throw error;
    }
  }

  private reportProgress(progress: number, message: string): void {
    this.options.onProgressUpdate?.(progress, message);
  }

  private initPhysics(): void {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as CANNON.GSSolver).iterations = 20;

    // Create materials
    const groundMaterial = new CANNON.Material('ground');
    this.carMaterial = new CANNON.Material('car');

    // Ground contact
    const carGroundContact = new CANNON.ContactMaterial(groundMaterial, this.carMaterial, {
      friction: 0.8,
      restitution: 0.0,
    });
    this.world.addContactMaterial(carGroundContact);
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.defaultContactMaterial.restitution = 0.0;

    // Ground body
    const groundShape = new CANNON.Box(new CANNON.Vec3(500, 0.5, 500));
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: groundShape,
      material: groundMaterial,
    });
    groundBody.position.set(0, -0.5, 0);
    this.world.addBody(groundBody);
  }

  private setupCollisionMaterials(): void {
    // Barrier-car contact
    const barrierCarContact = new CANNON.ContactMaterial(this.barrierMaterial, this.carMaterial, {
      friction: 0.5,
      restitution: 0.1,
    });
    this.world.addContactMaterial(barrierCarContact);

    // Car-car contact (for AI collisions)
    const carCarContact = new CANNON.ContactMaterial(this.carMaterial, this.carMaterial, {
      friction: 0.2,
      restitution: 0.6,
    });
    this.world.addContactMaterial(carCarContact);

    // Listen for collisions
    this.world.addEventListener('beginContact', (event: { bodyA: CANNON.Body; bodyB: CANNON.Body }) => {
      // Check if player car hit a barrier
      if (
        (event.bodyA === this.carBody || event.bodyB === this.carBody) &&
        (event.bodyA.material === this.barrierMaterial || event.bodyB.material === this.barrierMaterial)
      ) {
        // Reduce speed on barrier collision
        this.carSpeed *= 0.7;
      }
    });
  }

  private createVoxelCar(): void {
    // Physics body
    const carShape = new CANNON.Box(new CANNON.Vec3(1, 0.4, 2));
    this.carBody = new CANNON.Body({
      mass: 500,
      shape: carShape,
      material: this.carMaterial,
      linearDamping: 0.5,
      angularDamping: 0.8,
    });

    this.carBody.position.set(this.startPosition.x, 0.75, this.startPosition.z);
    this.carRotation = this.startPosition.rotation;
    this.world.addBody(this.carBody);

    // Create blocky voxel car group
    this.carMesh = new THREE.Group();
    this.wheelMeshes = [];

    // Body - main block (carbon black)
    const bodyGeo = new THREE.BoxGeometry(2, 0.6, 4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.black,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    body.castShadow = true;
    this.carMesh.add(body);

    // Red racing stripe on top
    const stripeGeo = new THREE.BoxGeometry(0.4, 0.02, 3.8);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.red,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.61, 0);
    this.carMesh.add(stripe);

    // Cabin (dark gray)
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.5, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.dark,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.75, -0.3);
    cabin.castShadow = true;
    this.carMesh.add(cabin);

    // Wheels (dark charcoal)
    const wheelGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.dark,
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
      this.carMesh.add(wheel);
      this.wheelMeshes.push(wheel);
    });

    // Headlights (warm yellow)
    const headlightGeo = new THREE.BoxGeometry(0.3, 0.3, 0.1);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.yellow,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    const hl1 = new THREE.Mesh(headlightGeo, headlightMat);
    hl1.position.set(-0.6, 0.3, 2);
    this.carMesh.add(hl1);

    const hl2 = new THREE.Mesh(headlightGeo, headlightMat);
    hl2.position.set(0.6, 0.3, 2);
    this.carMesh.add(hl2);

    // Taillights (red to match stripe)
    const taillightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.red,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    const tl1 = new THREE.Mesh(taillightGeo, taillightMat);
    tl1.position.set(-0.6, 0.35, -2);
    this.carMesh.add(tl1);

    const tl2 = new THREE.Mesh(taillightGeo, taillightMat);
    tl2.position.set(0.6, 0.35, -2);
    this.carMesh.add(tl2);

    this.engine.scene.add(this.carMesh);

    // Initialize camera
    this.cameraPosition.set(this.startPosition.x, 8, this.startPosition.z - 15);
    this.cameraTarget.set(this.startPosition.x, 0, this.startPosition.z);
    this.engine.camera.position.copy(this.cameraPosition);
    this.engine.camera.lookAt(this.cameraTarget);
  }

  private createAIRacers(): void {
    const personalities: AIPersonality[] = ['aggressive', 'balanced', 'defensive'];
    const aiStartPositions = this.trackBuilder.getAIStartPositions(this.AI_COUNT);

    for (let i = 0; i < this.AI_COUNT; i++) {
      const racer = new AIRacer(
        this.engine.scene,
        this.world,
        this.waypoints,
        aiStartPositions[i],
        personalities[i],
        i,
        this.carMaterial
      );
      this.aiRacers.push(racer);
    }
  }

  private update(deltaTime: number): void {
    if (this.isPaused || this.raceComplete) return;

    const input = this.inputManager.update();

    // Handle pause
    if (input.pause) {
      this.pause();
      this.options.onPause?.();
      return;
    }

    // Reset car
    if (input.resetVehicle) {
      this.resetCar();
    }

    // Update player car physics
    this.updatePlayerCar(deltaTime, input);

    // Update AI racers
    this.updateAIRacers(deltaTime);

    // Step physics world with higher substep count for better collision detection
    this.world.step(1 / 120, deltaTime, 10);

    // Force car to correct height after physics
    this.carBody.position.y = 0.75;

    // Detect and add skid marks
    this.handleSkidMarks(input, deltaTime);

    // Lap detection
    this.detectLapCrossing();

    // Update race position
    this.updateRacePosition();

    // Update UI
    this.updateGameState();
  }

  private updatePlayerCar(deltaTime: number, input: { throttle: number; steering: number }): void {
    // Start the race timer when player first provides throttle input
    if (!this.raceStarted && input.throttle > 0) {
      this.raceStarted = true;
      this.lapStartTime = performance.now();
      this.raceStartTime = performance.now();
    }

    // Acceleration
    if (input.throttle > 0) {
      this.carSpeed = Math.min(this.carSpeed + this.acceleration * deltaTime, this.maxSpeed);
    } else if (input.throttle < 0) {
      this.carSpeed = Math.max(this.carSpeed - this.brakeForce * deltaTime, -15);
    } else {
      if (this.carSpeed > 0) {
        this.carSpeed = Math.max(this.carSpeed - this.friction * deltaTime, 0);
      } else if (this.carSpeed < 0) {
        this.carSpeed = Math.min(this.carSpeed + this.friction * deltaTime, 0);
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

    this.carBody.position.x += forwardX * this.carSpeed * deltaTime;
    this.carBody.position.z += forwardZ * this.carSpeed * deltaTime;
    this.carBody.quaternion.setFromEuler(0, this.carRotation, 0);
  }

  private updateAIRacers(deltaTime: number): void {
    // Collect all racer states for obstacle avoidance
    const allStates: VehicleState[] = [
      {
        position: { x: this.carBody.position.x, y: this.carBody.position.y, z: this.carBody.position.z },
        rotation: {
          x: this.carBody.quaternion.x,
          y: this.carBody.quaternion.y,
          z: this.carBody.quaternion.z,
          w: this.carBody.quaternion.w,
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
      },
    ];

    // Add other AI states
    for (const racer of this.aiRacers) {
      allStates.push(racer.getVehicleState());
    }

    // Update each AI racer
    for (let i = 0; i < this.aiRacers.length; i++) {
      const obstacles = allStates.filter((_, idx) => idx !== i + 1);
      this.aiRacers[i].update(deltaTime, obstacles);
    }
  }

  private handleSkidMarks(input: { throttle: number; steering: number }, deltaTime: number): void {
    const now = performance.now();
    if (now - this.lastSkidTime < this.SKID_INTERVAL) return;

    const isSkidding =
      (Math.abs(input.steering) > 0.5 && Math.abs(this.carSpeed) > 15) ||
      (input.throttle < -0.5 && this.carSpeed > 10);

    if (isSkidding) {
      this.lastSkidTime = now;

      // Calculate rear wheel positions in world space
      const carPos = new THREE.Vector3(
        this.carBody.position.x,
        0,
        this.carBody.position.z
      );

      const leftOffset = new THREE.Vector3(-1.1, 0, -1.3);
      const rightOffset = new THREE.Vector3(1.1, 0, -1.3);

      // Rotate offsets by car rotation
      leftOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.carRotation);
      rightOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.carRotation);

      const leftWheelPos = carPos.clone().add(leftOffset);
      const rightWheelPos = carPos.clone().add(rightOffset);

      this.skidMarkManager.addSkidPair(leftWheelPos, rightWheelPos, this.carRotation);
    }
  }

  private detectLapCrossing(): void {
    const currentX = this.carBody.position.x;
    const currentZ = this.carBody.position.z;

    // Use the actual start position and track direction for finish line detection
    const startX = this.startPosition.x;
    const startZ = this.startPosition.z;
    const trackDir = this.startPosition.rotation;

    // Calculate distance along the track direction from start
    // This gives us a signed distance: positive when past the line in track direction
    const dx = currentX - startX;
    const dz = currentZ - startZ;

    // Project onto track direction (forward = positive)
    const forwardDist = dx * Math.sin(trackDir) + dz * Math.cos(trackDir);

    // Project onto perpendicular (lateral distance from finish line)
    const lateralDist = Math.abs(dx * Math.cos(trackDir) - dz * Math.sin(trackDir));

    // Track the previous forward distance
    const prevForwardDist = this.lastZ; // Repurposing lastZ as lastForwardDist

    // Finish line width based on track width at start
    const finishLineWidth = this.waypoints[0]?.width || 16;

    if (lateralDist < finishLineWidth / 2 && !this.raceComplete) {
      // Crossed from behind (-) to in front (+) of finish line
      if (prevForwardDist < 0 && forwardDist >= 0 && !this.crossedFinishLine) {
        this.crossedFinishLine = true;
        const lapTime = performance.now() - this.lapStartTime;

        if (this.currentLap > 0) {
          this.lapTimes.push(lapTime);

          if (this.bestLapTime === 0 || lapTime < this.bestLapTime) {
            this.bestLapTime = lapTime;
          }
        }

        if (this.currentLap >= this.gameState.totalLaps) {
          this.completeRace();
        } else {
          this.currentLap++;
          this.lapStartTime = performance.now();
        }
      } else if (forwardDist < -10) {
        // Reset flag when car is well behind the line
        this.crossedFinishLine = false;
      }
    }
    this.lastZ = forwardDist; // Store forward distance for next frame
  }

  private updateRacePosition(): void {
    if (this.gameMode !== 'race') return;

    let position = 1;
    const playerProgress = this.getPlayerProgress();

    for (const racer of this.aiRacers) {
      const aiProgress = this.getAIProgress(racer);
      if (aiProgress > playerProgress) {
        position++;
      }
    }

    this.racePosition = position;
  }

  private getPlayerProgress(): number {
    return this.currentLap * 1000 + this.getWaypointProgress(
      this.carBody.position.x,
      this.carBody.position.z
    );
  }

  private getAIProgress(racer: AIRacer): number {
    const state = racer.getState();
    return racer.getLap() * 1000 + state.waypointIndex;
  }

  private getWaypointProgress(x: number, z: number): number {
    let minDist = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const dx = wp.x - x;
      const dz = wp.z - z;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  private completeRace(): void {
    this.raceComplete = true;
    const totalTime = performance.now() - this.raceStartTime;

    this.carSpeed = 0;

    this.options.onRaceComplete?.({
      totalTime,
      bestLapTime: this.bestLapTime,
      lapTimes: this.lapTimes,
      totalLaps: this.gameState.totalLaps,
      position: this.racePosition,
    });

    this.pause();
  }

  private updateGameState(): void {
    const now = performance.now();
    if (now - this.lastUIUpdate < this.UI_UPDATE_INTERVAL) return;
    this.lastUIUpdate = now;

    // Only count time if race has started
    const currentLapTime = this.raceStarted ? now - this.lapStartTime : 0;
    const speedKmh = Math.abs(this.carSpeed) * 3.6;

    let gear = 1;
    if (this.carSpeed < 0) {
      gear = -1;
    } else if (speedKmh < 10) {
      gear = 1;
    } else if (speedKmh < 50) {
      gear = 2;
    } else if (speedKmh < 100) {
      gear = 3;
    } else if (speedKmh < 150) {
      gear = 4;
    } else {
      gear = 5;
    }

    this.gameState = {
      ...this.gameState,
      speed: Math.round(speedKmh),
      gear,
      lap: this.currentLap,
      position: this.racePosition,
      lapTime: currentLapTime,
      bestLapTime: this.bestLapTime,
      carX: this.carBody.position.x,
      carZ: this.carBody.position.z,
      carRotation: this.carRotation,
    };

    this.options.onGameStateUpdate?.({ ...this.gameState });
  }

  private render(): void {
    // Sync car visual with physics
    this.carMesh.position.set(
      this.carBody.position.x,
      this.carBody.position.y,
      this.carBody.position.z
    );
    this.carMesh.quaternion.set(
      this.carBody.quaternion.x,
      this.carBody.quaternion.y,
      this.carBody.quaternion.z,
      this.carBody.quaternion.w
    );

    // Animate wheels based on speed
    const wheelRotation = this.carSpeed * 0.1;
    this.wheelMeshes.forEach((wheel) => {
      wheel.rotation.x += wheelRotation;
    });

    // Smooth camera follow
    const carPos = this.carMesh.position;
    const carDir = new THREE.Vector3(0, 0, 1);
    carDir.applyQuaternion(this.carMesh.quaternion);

    const cameraOffset = carDir.clone().multiplyScalar(-12);
    cameraOffset.y = 6;

    const targetCamPos = carPos.clone().add(cameraOffset);
    this.cameraPosition.lerp(targetCamPos, 0.05);
    this.engine.camera.position.copy(this.cameraPosition);

    this.cameraTarget.lerp(carPos.clone().add(new THREE.Vector3(0, 1, 0)), 0.1);
    this.engine.camera.lookAt(this.cameraTarget);

    // Render
    this.engine.render();
  }

  private resetCar(): void {
    this.carBody.position.set(this.startPosition.x, 0.75, this.startPosition.z);
    this.carBody.quaternion.setFromEuler(0, this.startPosition.rotation, 0);
    this.carBody.velocity.set(0, 0, 0);
    this.carBody.angularVelocity.set(0, 0, 0);
    this.carSpeed = 0;
    this.carRotation = this.startPosition.rotation;
    this.lapStartTime = performance.now();
  }

  public pause(): void {
    this.isPaused = true;
    this.gameLoop?.pause();
  }

  public resume(): void {
    this.isPaused = false;
    this.gameLoop?.resume();
  }

  public restart(): void {
    // Reset player
    this.resetCar();

    // Reset AI racers
    const aiStartPositions = this.trackBuilder.getAIStartPositions(this.AI_COUNT);
    for (let i = 0; i < this.aiRacers.length; i++) {
      this.aiRacers[i].reset(aiStartPositions[i]);
    }

    // Reset game state
    this.currentLap = 1;
    this.racePosition = 1;
    this.bestLapTime = 0;
    this.lapTimes = [];
    this.raceComplete = false;
    this.crossedFinishLine = false;
    this.raceStarted = false;
    this.lapStartTime = 0;
    this.raceStartTime = 0;
    // Reset forward distance to positive value so car must complete a full lap
    this.lastZ = 5;

    // Clear skid marks
    this.skidMarkManager.clear();

    this.resume();
  }

  public dispose(): void {
    this.gameLoop?.stop();
    this.inputManager?.dispose();
    this.skidMarkManager?.dispose();

    // Dispose AI racers
    for (const racer of this.aiRacers) {
      racer.dispose(this.engine.scene, this.world);
    }
    this.aiRacers = [];

    this.engine?.dispose();
  }

  public getGameState(): GameState {
    return { ...this.gameState };
  }

  public isRunning(): boolean {
    return this.isInitialized && !this.isPaused;
  }

  public getMinimapData(): MinimapData | null {
    if (!this.trackBuilder) return null;
    return this.trackBuilder.getMinimapData();
  }

  public getCustomTrackId(): string | undefined {
    return this.options.customTrack?.id;
  }
}
