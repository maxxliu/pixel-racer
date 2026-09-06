export interface TrackWaypoint {
  x: number;
  z: number;
  width: number;
  speedLimit: number;
  isCheckpoint?: boolean;
}

export interface StartPosition {
  x: number;
  z: number;
  rotation: number;
}

export interface CustomTrackData {
  waypoints: TrackWaypoint[];
  startPosition?: StartPosition;
  id?: string;
  name?: string;
}

export type GameMode = 'time-trial' | 'race';

export interface Vec2 {
  x: number;
  z: number;
}
