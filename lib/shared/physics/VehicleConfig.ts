export interface WheelConfig {
  radius: number;
  suspensionStiffness: number;
  suspensionRestLength: number;
  frictionSlip: number;
  dampingRelaxation: number;
  dampingCompression: number;
  maxSuspensionForce: number;
  rollInfluence: number;
  maxSuspensionTravel: number;
  customSlidingRotationalSpeed: number;
  useCustomSlidingRotationalSpeed: boolean;
}

export interface VehicleConfig {
  chassisMass: number;
  chassisWidth: number;
  chassisHeight: number;
  chassisLength: number;
  maxSteerAngle: number;
  maxForce: number;
  maxBrakeForce: number;
  frontWheelOffset: number;
  rearWheelOffset: number;
  wheelTrack: number;
  wheelHeight: number;
  wheel: WheelConfig;
}

// Default arcade-style vehicle configuration
export const ARCADE_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 150,
  chassisWidth: 1.8,
  chassisHeight: 0.6,
  chassisLength: 4.0,
  maxSteerAngle: Math.PI / 6, // 30 degrees
  maxForce: 1000,
  maxBrakeForce: 50,
  frontWheelOffset: 1.5,
  rearWheelOffset: -1.3,
  wheelTrack: 0.9, // Half width between wheels
  wheelHeight: -0.3, // Below chassis center
  wheel: {
    radius: 0.4,
    suspensionStiffness: 30,
    suspensionRestLength: 0.5,
    frictionSlip: 1.5, // Higher = more grip
    dampingRelaxation: 2.3,
    dampingCompression: 4.4,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01, // Lower = less body roll
    maxSuspensionTravel: 0.5,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
  },
};

// Sports car - faster, less grip
export const SPORTS_VEHICLE_CONFIG: VehicleConfig = {
  ...ARCADE_VEHICLE_CONFIG,
  chassisMass: 120,
  maxForce: 1400,
  wheel: {
    ...ARCADE_VEHICLE_CONFIG.wheel,
    frictionSlip: 1.2,
    suspensionStiffness: 40,
  },
};

// Off-road - more grip, softer suspension
export const OFFROAD_VEHICLE_CONFIG: VehicleConfig = {
  ...ARCADE_VEHICLE_CONFIG,
  chassisMass: 200,
  chassisHeight: 0.8,
  maxForce: 1200,
  wheel: {
    ...ARCADE_VEHICLE_CONFIG.wheel,
    radius: 0.45,
    frictionSlip: 2.0,
    suspensionStiffness: 20,
    suspensionRestLength: 0.4,
    maxSuspensionTravel: 0.5,
  },
};

// Muscle car - powerful but harder to control
export const MUSCLE_VEHICLE_CONFIG: VehicleConfig = {
  ...ARCADE_VEHICLE_CONFIG,
  chassisMass: 180,
  chassisLength: 4.5,
  maxForce: 1600,
  maxSteerAngle: Math.PI / 7,
  wheel: {
    ...ARCADE_VEHICLE_CONFIG.wheel,
    frictionSlip: 1.3,
    rollInfluence: 0.02,
  },
};

export const VEHICLE_CONFIGS = {
  arcade: ARCADE_VEHICLE_CONFIG,
  sports: SPORTS_VEHICLE_CONFIG,
  offroad: OFFROAD_VEHICLE_CONFIG,
  muscle: MUSCLE_VEHICLE_CONFIG,
} as const;

export type VehicleType = keyof typeof VEHICLE_CONFIGS;
