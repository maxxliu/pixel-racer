export interface Waypoint {
  x: number;
  y: number;
  z: number;
  width: number; // Track width at this point
  speedLimit?: number; // Suggested speed (for AI)
  isCheckpoint?: boolean;
}

export interface TrackData {
  name: string;
  waypoints: Waypoint[];
  startPositions: { x: number; y: number; z: number; rotationY: number }[];
  laps: number;
  checkpointCount: number;
}

// Helper to create a simple oval track
export function createOvalTrack(
  centerX: number = 0,
  centerZ: number = 0,
  radiusX: number = 200,
  radiusZ: number = 150,
  waypointCount: number = 32
): TrackData {
  const waypoints: Waypoint[] = [];

  for (let i = 0; i < waypointCount; i++) {
    const angle = (i / waypointCount) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radiusX;
    const z = centerZ + Math.sin(angle) * radiusZ;

    waypoints.push({
      x,
      y: 0.5,
      z,
      width: 20,
      speedLimit: 120,
      isCheckpoint: i % 8 === 0,
    });
  }

  // Start positions (staggered grid)
  const startPositions = [];
  const startAngle = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const offset = row * 5;
      const lateralOffset = (col - 0.5) * 4;
      startPositions.push({
        x: centerX + Math.cos(startAngle) * (radiusX - offset) + lateralOffset,
        y: 0.5,
        z: centerZ + Math.sin(startAngle) * (radiusZ - offset),
        rotationY: startAngle - Math.PI / 2,
      });
    }
  }

  return {
    name: 'Oval Circuit',
    waypoints,
    startPositions,
    laps: 3,
    checkpointCount: waypoints.filter((w) => w.isCheckpoint).length,
  };
}

// Create a more complex circuit
export function createCircuit(): TrackData {
  const waypoints: Waypoint[] = [
    // Start/finish straight
    { x: 0, y: 0.5, z: 0, width: 20, speedLimit: 180, isCheckpoint: true },
    { x: 50, y: 0.5, z: 0, width: 20, speedLimit: 180 },
    { x: 100, y: 0.5, z: 0, width: 20, speedLimit: 160 },
    // Turn 1 (right hairpin)
    { x: 140, y: 0.5, z: 10, width: 18, speedLimit: 80 },
    { x: 160, y: 0.5, z: 40, width: 18, speedLimit: 60 },
    { x: 150, y: 0.5, z: 70, width: 18, speedLimit: 80, isCheckpoint: true },
    // Back straight
    { x: 120, y: 0.5, z: 90, width: 20, speedLimit: 140 },
    { x: 80, y: 0.5, z: 100, width: 20, speedLimit: 160 },
    { x: 40, y: 0.5, z: 105, width: 20, speedLimit: 160 },
    // S-curve
    { x: 0, y: 0.5, z: 100, width: 16, speedLimit: 100, isCheckpoint: true },
    { x: -30, y: 0.5, z: 85, width: 16, speedLimit: 90 },
    { x: -50, y: 0.5, z: 65, width: 16, speedLimit: 90 },
    { x: -40, y: 0.5, z: 45, width: 16, speedLimit: 100 },
    // Final corner
    { x: -20, y: 0.5, z: 25, width: 18, speedLimit: 110, isCheckpoint: true },
    { x: -10, y: 0.5, z: 10, width: 18, speedLimit: 130 },
  ];

  const startPositions = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      startPositions.push({
        x: -row * 6,
        y: 0.5,
        z: (col - 0.5) * 4,
        rotationY: 0,
      });
    }
  }

  return {
    name: 'Circuit One',
    waypoints,
    startPositions,
    laps: 3,
    checkpointCount: waypoints.filter((w) => w.isCheckpoint).length,
  };
}

// Helper to find closest waypoint
export function findClosestWaypoint(
  position: { x: number; z: number },
  waypoints: Waypoint[]
): { index: number; distance: number } {
  let closestIndex = 0;
  let closestDistance = Infinity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const dx = wp.x - position.x;
    const dz = wp.z - position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return { index: closestIndex, distance: closestDistance };
}

// Helper to get next waypoint with lookahead
export function getTargetWaypoint(
  position: { x: number; z: number },
  velocity: { x: number; z: number },
  waypoints: Waypoint[],
  lookahead: number = 30
): Waypoint {
  const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2) * 3.6;
  const dynamicLookahead = lookahead + speed * 0.3;

  const closest = findClosestWaypoint(position, waypoints);
  let targetIndex = closest.index;

  // Find waypoint at lookahead distance
  let totalDistance = 0;
  while (totalDistance < dynamicLookahead) {
    const nextIndex = (targetIndex + 1) % waypoints.length;
    const current = waypoints[targetIndex];
    const next = waypoints[nextIndex];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    totalDistance += Math.sqrt(dx * dx + dz * dz);
    targetIndex = nextIndex;
  }

  return waypoints[targetIndex];
}
