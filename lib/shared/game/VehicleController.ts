import { VehicleInput, VehicleState } from '../physics/VehiclePhysics';

/**
 * Common interface for vehicle controllers (human or AI)
 * This allows the same vehicle simulation code to work with both
 */
export interface IVehicleController {
  update(state: VehicleState, deltaTime: number): VehicleInput;
  getId(): string;
  getName(): string;
  isAI(): boolean;
}

/**
 * Controller for human players - receives input from InputManager
 */
export class HumanController implements IVehicleController {
  private id: string;
  private name: string;
  private currentInput: VehicleInput = {
    throttle: 0,
    steering: 0,
    brake: false,
    handbrake: false,
  };

  constructor(id: string, name: string = 'Player') {
    this.id = id;
    this.name = name;
  }

  public setInput(input: Partial<VehicleInput>): void {
    this.currentInput = { ...this.currentInput, ...input };
  }

  public update(_state: VehicleState, _deltaTime: number): VehicleInput {
    return { ...this.currentInput };
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public isAI(): boolean {
    return false;
  }
}

/**
 * Input snapshot for network synchronization
 */
export interface InputSnapshot {
  sequenceNumber: number;
  timestamp: number;
  input: VehicleInput;
}

/**
 * State snapshot for network synchronization
 */
export interface StateSnapshot {
  sequenceNumber: number;
  timestamp: number;
  state: VehicleState;
}

/**
 * Racer data for the race system
 */
export interface RacerData {
  id: string;
  name: string;
  vehicleType: string;
  controller: IVehicleController;
  currentLap: number;
  lastCheckpoint: number;
  lapTimes: number[];
  bestLapTime: number;
  totalTime: number;
  position: number;
  isFinished: boolean;
  state: VehicleState | null;
}

/**
 * Create a new racer data object
 */
export function createRacerData(
  id: string,
  name: string,
  vehicleType: string,
  controller: IVehicleController
): RacerData {
  return {
    id,
    name,
    vehicleType,
    controller,
    currentLap: 0,
    lastCheckpoint: -1,
    lapTimes: [],
    bestLapTime: 0,
    totalTime: 0,
    position: 0,
    isFinished: false,
    state: null,
  };
}
