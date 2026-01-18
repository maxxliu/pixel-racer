import { TrackData, Waypoint, findClosestWaypoint } from '../shared/game/TrackData';
import { VehicleState } from '../shared/physics/VehiclePhysics';

export type RacePhase = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface RaceState {
  phase: RacePhase;
  currentLap: number;
  totalLaps: number;
  position: number;
  lapTime: number;
  bestLapTime: number;
  totalTime: number;
  lastCheckpoint: number;
  checkpointCount: number;
}

export class RaceManager {
  private trackData: TrackData;
  private state: RaceState;

  private raceStartTime: number = 0;
  private lapStartTime: number = 0;
  private checkpoints: Waypoint[];

  constructor(trackData: TrackData) {
    this.trackData = trackData;
    this.checkpoints = trackData.waypoints.filter((wp) => wp.isCheckpoint);

    this.state = {
      phase: 'racing', // Start immediately for single player
      currentLap: 1,
      totalLaps: trackData.laps,
      position: 1,
      lapTime: 0,
      bestLapTime: 0,
      totalTime: 0,
      lastCheckpoint: -1,
      checkpointCount: this.checkpoints.length,
    };

    this.raceStartTime = Date.now();
    this.lapStartTime = Date.now();
  }

  public update(deltaTime: number, playerState: VehicleState): void {
    if (this.state.phase !== 'racing') return;

    const now = Date.now();

    // Update times
    this.state.lapTime = now - this.lapStartTime;
    this.state.totalTime = now - this.raceStartTime;

    // Check checkpoint progress
    this.checkCheckpoints(playerState);
  }

  private checkCheckpoints(state: VehicleState): void {
    const position = { x: state.position.x, z: state.position.z };

    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      const dx = cp.x - position.x;
      const dz = cp.z - position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Check if player is near checkpoint
      if (distance < cp.width) {
        const expectedCheckpoint = (this.state.lastCheckpoint + 1) % this.checkpoints.length;

        if (i === expectedCheckpoint) {
          this.state.lastCheckpoint = i;

          // Check for lap completion (crossed start/finish checkpoint)
          if (i === 0 && this.state.lapTime > 5000) {
            // Minimum 5 seconds to avoid false triggers
            this.completeLap();
          }
          break;
        }
      }
    }
  }

  private completeLap(): void {
    const lapTime = this.state.lapTime;

    // Update best lap time
    if (this.state.bestLapTime === 0 || lapTime < this.state.bestLapTime) {
      this.state.bestLapTime = lapTime;
    }

    // Increment lap
    this.state.currentLap++;

    // Check for race completion
    if (this.state.currentLap > this.state.totalLaps) {
      this.state.phase = 'finished';
      this.state.currentLap = this.state.totalLaps; // Cap at total laps
    } else {
      // Start new lap
      this.lapStartTime = Date.now();
      this.state.lapTime = 0;
    }
  }

  public getState(): RaceState {
    return { ...this.state };
  }

  public reset(): void {
    this.state = {
      phase: 'racing',
      currentLap: 1,
      totalLaps: this.trackData.laps,
      position: 1,
      lapTime: 0,
      bestLapTime: 0,
      totalTime: 0,
      lastCheckpoint: -1,
      checkpointCount: this.checkpoints.length,
    };

    this.raceStartTime = Date.now();
    this.lapStartTime = Date.now();
  }

  public startRace(): void {
    this.state.phase = 'racing';
    this.raceStartTime = Date.now();
    this.lapStartTime = Date.now();
  }

  public isFinished(): boolean {
    return this.state.phase === 'finished';
  }

  public getProgress(): number {
    // Calculate overall race progress (0-1)
    const lapProgress =
      this.state.lastCheckpoint >= 0
        ? (this.state.lastCheckpoint + 1) / this.checkpoints.length
        : 0;
    const totalProgress =
      ((this.state.currentLap - 1) + lapProgress) / this.state.totalLaps;
    return Math.min(1, totalProgress);
  }

  public formatTime(ms: number): string {
    if (ms === 0) return '--:--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }
}
