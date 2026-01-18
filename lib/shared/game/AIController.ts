import { VehicleInput, VehicleState } from '../physics/VehiclePhysics';
import { Waypoint, getTargetWaypoint, findClosestWaypoint } from './TrackData';

export type AIPersonality = 'aggressive' | 'defensive' | 'balanced' | 'rookie';

export interface AIConfig {
  personality: AIPersonality;
  skillLevel: number; // 0-1, affects reaction time and precision
  lookaheadDistance: number;
  maxSpeedFactor: number; // Multiplier for suggested speeds
  aggressiveness: number; // 0-1, willingness to take risks
  reactionTime: number; // Delay in seconds
}

const AI_PRESETS: Record<AIPersonality, Omit<AIConfig, 'personality'>> = {
  aggressive: {
    skillLevel: 0.9,
    lookaheadDistance: 40,
    maxSpeedFactor: 1.1,
    aggressiveness: 0.9,
    reactionTime: 0.05,
  },
  defensive: {
    skillLevel: 0.7,
    lookaheadDistance: 50,
    maxSpeedFactor: 0.9,
    aggressiveness: 0.3,
    reactionTime: 0.15,
  },
  balanced: {
    skillLevel: 0.8,
    lookaheadDistance: 45,
    maxSpeedFactor: 1.0,
    aggressiveness: 0.5,
    reactionTime: 0.1,
  },
  rookie: {
    skillLevel: 0.5,
    lookaheadDistance: 35,
    maxSpeedFactor: 0.75,
    aggressiveness: 0.2,
    reactionTime: 0.25,
  },
};

export class AIController {
  private config: AIConfig;
  private waypoints: Waypoint[];
  private currentWaypointIndex: number = 0;
  private inputHistory: VehicleInput[] = [];
  private reactionBuffer: VehicleInput | null = null;
  private reactionTimer: number = 0;
  private errorFactor: number = 0;
  private errorUpdateTimer: number = 0;

  constructor(waypoints: Waypoint[], personality: AIPersonality = 'balanced') {
    this.waypoints = waypoints;
    this.config = {
      personality,
      ...AI_PRESETS[personality],
    };
  }

  public setPersonality(personality: AIPersonality): void {
    this.config = {
      personality,
      ...AI_PRESETS[personality],
    };
  }

  public update(state: VehicleState, deltaTime: number, obstacles: VehicleState[] = []): VehicleInput {
    // Update error factor periodically (simulates human inconsistency)
    this.errorUpdateTimer += deltaTime;
    if (this.errorUpdateTimer > 0.5) {
      this.errorUpdateTimer = 0;
      this.errorFactor = (Math.random() - 0.5) * 2 * (1 - this.config.skillLevel);
    }

    // Get target waypoint
    const position = { x: state.position.x, z: state.position.z };
    const velocity = { x: state.velocity.x, z: state.velocity.z };
    const targetWaypoint = getTargetWaypoint(
      position,
      velocity,
      this.waypoints,
      this.config.lookaheadDistance
    );

    // Update current waypoint tracking
    const closest = findClosestWaypoint(position, this.waypoints);
    this.currentWaypointIndex = closest.index;

    // Calculate steering
    const steering = this.calculateSteering(state, targetWaypoint);

    // Calculate throttle/braking
    const { throttle, brake } = this.calculateThrottle(state, targetWaypoint, obstacles);

    const input: VehicleInput = {
      steering: steering * (1 + this.errorFactor * 0.2),
      throttle,
      brake,
      handbrake: false,
    };

    // Apply reaction time delay
    if (this.config.reactionTime > 0) {
      this.reactionTimer += deltaTime;
      if (this.reactionTimer >= this.config.reactionTime) {
        this.reactionTimer = 0;
        this.reactionBuffer = input;
      }
      return this.reactionBuffer || input;
    }

    return input;
  }

  private calculateSteering(state: VehicleState, target: Waypoint): number {
    // Get vehicle forward direction from quaternion
    const q = state.rotation;
    const forwardX = 2 * (q.x * q.z + q.w * q.y);
    const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);

    // Direction to target
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.1) return 0;

    // Normalize
    const targetDirX = dx / distance;
    const targetDirZ = dz / distance;

    // Cross product to determine turn direction
    const cross = forwardX * targetDirZ - forwardZ * targetDirX;

    // Dot product to check if we're facing target
    const dot = forwardX * targetDirX + forwardZ * targetDirZ;

    // Calculate steering amount
    let steering = cross * 2;

    // If target is behind us, steer harder
    if (dot < 0) {
      steering = Math.sign(cross) * 1;
    }

    // Clamp and apply skill-based smoothing
    return Math.max(-1, Math.min(1, steering));
  }

  private calculateThrottle(
    state: VehicleState,
    target: Waypoint,
    obstacles: VehicleState[]
  ): { throttle: number; brake: boolean } {
    const speed = state.speed;
    const targetSpeed = (target.speedLimit || 100) * this.config.maxSpeedFactor;

    // Check for nearby obstacles
    const obstacleAhead = this.checkObstacleAhead(state, obstacles);

    // Calculate distance to target
    const dx = target.x - state.position.x;
    const dz = target.z - state.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Basic speed control
    let throttle = 1;
    let brake = false;

    if (obstacleAhead) {
      // Slow down for obstacle
      throttle = 0;
      brake = speed > obstacleAhead.safeSpeed;
    } else if (speed > targetSpeed * 1.1) {
      // Over speed limit
      throttle = 0;
      brake = speed > targetSpeed * 1.2;
    } else if (speed > targetSpeed * 0.9) {
      // Near speed limit
      throttle = 0.3;
    } else {
      // Below speed limit, accelerate
      throttle = Math.min(1, this.config.aggressiveness + 0.5);
    }

    // Add some skill-based variance
    throttle *= (0.9 + this.config.skillLevel * 0.1);

    return { throttle, brake };
  }

  private checkObstacleAhead(
    state: VehicleState,
    obstacles: VehicleState[]
  ): { distance: number; safeSpeed: number } | null {
    if (obstacles.length === 0) return null;

    // Get forward direction
    const q = state.rotation;
    const forwardX = 2 * (q.x * q.z + q.w * q.y);
    const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);

    for (const obstacle of obstacles) {
      const dx = obstacle.position.x - state.position.x;
      const dz = obstacle.position.z - state.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Only check obstacles within range
      if (distance > 50) continue;

      // Check if obstacle is ahead
      const dot = (dx * forwardX + dz * forwardZ) / distance;
      if (dot < 0.5) continue; // Not ahead

      // Check if obstacle is in our path
      const cross = Math.abs(dx * forwardZ - dz * forwardX) / distance;
      if (cross > 0.3) continue; // Not in path

      // Calculate safe speed based on distance
      const safeSpeed = Math.max(20, distance * 2);

      return { distance, safeSpeed };
    }

    return null;
  }

  public getCurrentWaypointIndex(): number {
    return this.currentWaypointIndex;
  }

  public getConfig(): AIConfig {
    return { ...this.config };
  }
}

// Helper to create multiple AI controllers with varied personalities
export function createAIRacers(
  count: number,
  waypoints: Waypoint[]
): AIController[] {
  const personalities: AIPersonality[] = ['aggressive', 'defensive', 'balanced', 'rookie'];
  const controllers: AIController[] = [];

  for (let i = 0; i < count; i++) {
    const personality = personalities[i % personalities.length];
    controllers.push(new AIController(waypoints, personality));
  }

  return controllers;
}
