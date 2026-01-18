import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface TrackWaypoint {
  x: number;
  z: number;
  width: number;
  speedLimit: number;
  isCheckpoint?: boolean;
}

export interface TrackData {
  waypoints: TrackWaypoint[];
  startPosition: { x: number; z: number; rotation: number };
  innerBarriers: { x: number; z: number; rotation: number }[];
  outerBarriers: { x: number; z: number; rotation: number }[];
}

export interface MinimapData {
  centerPath: string;
  innerPath: string;
  outerPath: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// 8-bit color palette
const PIXEL_COLORS = {
  black: 0x0f0f23,
  dark: 0x1a1a2e,
  mid: 0x2d2d44,
  light: 0x4a4a6a,
  red: 0xff004d,
  orange: 0xffa300,
  yellow: 0xffec27,
  green: 0x00e436,
  cyan: 0x29adff,
  blue: 0x1d2b53,
  purple: 0x7e2553,
  pink: 0xff77a8,
  white: 0xfff1e8,
  gray: 0x5f574f,
};

export class TrackBuilder {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private trackData: TrackData;
  private barrierBodies: CANNON.Body[] = [];
  private barrierMaterial: CANNON.Material;

  // Curve-based track generation
  private trackCurve: THREE.CatmullRomCurve3 | null = null;
  private curvePoints: THREE.Vector3[] = [];
  private readonly CURVE_SEGMENTS = 200; // Points along the curve

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    this.barrierMaterial = new CANNON.Material('barrier');
    this.trackData = this.generateTrackData();
  }

  private generateTrackCurve(): void {
    const points = this.trackData.waypoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
    this.trackCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
    this.curvePoints = this.trackCurve.getPoints(this.CURVE_SEGMENTS);
  }

  private getWidthAtT(t: number): number {
    const waypoints = this.trackData.waypoints;
    const numWaypoints = waypoints.length;

    // Find which waypoint segment we're in
    const segmentFloat = t * numWaypoints;
    const segmentIndex = Math.floor(segmentFloat) % numWaypoints;
    const segmentT = segmentFloat - Math.floor(segmentFloat);

    const currentWidth = waypoints[segmentIndex].width;
    const nextWidth = waypoints[(segmentIndex + 1) % numWaypoints].width;

    // Smooth interpolation between widths
    return currentWidth + (nextWidth - currentWidth) * segmentT;
  }

  private generateTrackData(): TrackData {
    // Fun racing circuit with variety - designed for good flow
    const waypoints: TrackWaypoint[] = [
      // Start/finish straight (heading +Z)
      { x: 0, z: 0, width: 18, speedLimit: 180, isCheckpoint: true },
      { x: 0, z: 40, width: 18, speedLimit: 180 },
      { x: 0, z: 80, width: 16, speedLimit: 160 },

      // Turn 1-2: Fast right-left complex
      { x: 20, z: 110, width: 15, speedLimit: 120 },
      { x: 50, z: 125, width: 14, speedLimit: 100, isCheckpoint: true },
      { x: 80, z: 120, width: 15, speedLimit: 110 },

      // Back straight with slight kink
      { x: 110, z: 100, width: 16, speedLimit: 150 },
      { x: 140, z: 85, width: 16, speedLimit: 160 },
      { x: 165, z: 65, width: 16, speedLimit: 150 },

      // Hairpin: Heavy braking zone
      { x: 180, z: 40, width: 13, speedLimit: 70 },
      { x: 185, z: 15, width: 12, speedLimit: 50, isCheckpoint: true },
      { x: 175, z: -5, width: 12, speedLimit: 50 },
      { x: 155, z: -15, width: 13, speedLimit: 70 },

      // Technical esses section
      { x: 125, z: -25, width: 13, speedLimit: 80 },
      { x: 95, z: -15, width: 13, speedLimit: 85 },
      { x: 65, z: -30, width: 13, speedLimit: 80, isCheckpoint: true },
      { x: 35, z: -20, width: 13, speedLimit: 85 },

      // Sweeping left turn
      { x: 10, z: -35, width: 15, speedLimit: 100 },
      { x: -15, z: -45, width: 15, speedLimit: 110 },
      { x: -35, z: -40, width: 15, speedLimit: 120 },

      // Final chicane before finish
      { x: -45, z: -20, width: 14, speedLimit: 90 },
      { x: -40, z: 0, width: 14, speedLimit: 95 },
      { x: -25, z: 15, width: 15, speedLimit: 100 },
      { x: -10, z: 5, width: 16, speedLimit: 120 },
    ];

    // Generate curve first for barrier positions
    const points = waypoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
    const tempCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);

    // Generate barriers along the smooth curve
    const { innerBarriers, outerBarriers } = this.generateBarrierPositions(waypoints, tempCurve);

    return {
      waypoints,
      startPosition: { x: 0, z: 0, rotation: 0 },
      innerBarriers,
      outerBarriers,
    };
  }

  private generateBarrierPositions(
    waypoints: TrackWaypoint[],
    curve: THREE.CatmullRomCurve3
  ): {
    innerBarriers: { x: number; z: number; rotation: number }[];
    outerBarriers: { x: number; z: number; rotation: number }[];
  } {
    const innerBarriers: { x: number; z: number; rotation: number }[] = [];
    const outerBarriers: { x: number; z: number; rotation: number }[] = [];
    const barrierSpacing = 4; // Tighter spacing for better coverage

    // Calculate total curve length
    const numSamples = this.CURVE_SEGMENTS;
    const barrierOffset = 1.5; // Distance from track edge to barrier center

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);

      // Calculate perpendicular direction (in XZ plane)
      const perpX = -tangent.z;
      const perpZ = tangent.x;

      // Get interpolated width at this position
      const width = this.getWidthAtCurveT(t, waypoints);
      const halfWidth = width / 2;

      // Calculate rotation from tangent
      const rotation = Math.atan2(tangent.x, tangent.z);

      // Only place barriers at spacing intervals
      if (i % Math.floor(numSamples / (numSamples * barrierSpacing / this.getCurveLength(curve))) === 0 || i === 0) {
        // Inner barrier (right side when facing forward)
        innerBarriers.push({
          x: point.x + perpX * (halfWidth + barrierOffset),
          z: point.z + perpZ * (halfWidth + barrierOffset),
          rotation,
        });

        // Outer barrier (left side)
        outerBarriers.push({
          x: point.x - perpX * (halfWidth + barrierOffset),
          z: point.z - perpZ * (halfWidth + barrierOffset),
          rotation,
        });
      }
    }

    // Ensure consistent barrier count by sampling at regular curve intervals
    const targetBarrierCount = Math.floor(this.getCurveLength(curve) / barrierSpacing);

    return {
      innerBarriers: this.resampleBarriers(innerBarriers, targetBarrierCount, curve, waypoints, 1),
      outerBarriers: this.resampleBarriers(outerBarriers, targetBarrierCount, curve, waypoints, -1)
    };
  }

  private resampleBarriers(
    barriers: { x: number; z: number; rotation: number }[],
    targetCount: number,
    curve: THREE.CatmullRomCurve3,
    waypoints: TrackWaypoint[],
    side: number // 1 for inner, -1 for outer
  ): { x: number; z: number; rotation: number }[] {
    const result: { x: number; z: number; rotation: number }[] = [];
    const barrierOffset = 1.5;

    for (let i = 0; i < targetCount; i++) {
      const t = i / targetCount;
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);

      const perpX = -tangent.z;
      const perpZ = tangent.x;

      const width = this.getWidthAtCurveT(t, waypoints);
      const halfWidth = width / 2;

      const rotation = Math.atan2(tangent.x, tangent.z);

      result.push({
        x: point.x + side * perpX * (halfWidth + barrierOffset),
        z: point.z + side * perpZ * (halfWidth + barrierOffset),
        rotation,
      });
    }

    return result;
  }

  private getWidthAtCurveT(t: number, waypoints: TrackWaypoint[]): number {
    const numWaypoints = waypoints.length;
    const segmentFloat = t * numWaypoints;
    const segmentIndex = Math.floor(segmentFloat) % numWaypoints;
    const segmentT = segmentFloat - Math.floor(segmentFloat);

    const currentWidth = waypoints[segmentIndex].width;
    const nextWidth = waypoints[(segmentIndex + 1) % numWaypoints].width;

    // Smooth cubic interpolation
    const smoothT = segmentT * segmentT * (3 - 2 * segmentT);
    return currentWidth + (nextWidth - currentWidth) * smoothT;
  }

  private getCurveLength(curve: THREE.CatmullRomCurve3): number {
    const points = curve.getPoints(100);
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += points[i].distanceTo(points[i - 1]);
    }
    // Add closing segment
    length += points[points.length - 1].distanceTo(points[0]);
    return length;
  }

  public build(): TrackData {
    this.generateTrackCurve();
    this.createGround();
    this.createTrackSurface();
    this.createBarriers();
    this.createStartFinishLine();
    return this.trackData;
  }

  private createGround(): void {
    // Base ground
    const groundGeo = new THREE.PlaneGeometry(500, 500, 25, 25);
    const groundMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.green,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(500, 50, PIXEL_COLORS.dark, PIXEL_COLORS.dark);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  private createTrackSurface(): void {
    if (!this.trackCurve) return;

    const waypoints = this.trackData.waypoints;
    const numSegments = this.CURVE_SEGMENTS;

    // Build continuous track geometry
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Colors for alternating segments
    const darkColor = new THREE.Color(PIXEL_COLORS.dark);
    const midColor = new THREE.Color(PIXEL_COLORS.mid);

    // Generate vertices along the curve
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const point = this.trackCurve.getPoint(t % 1);
      const tangent = this.trackCurve.getTangent(t % 1);

      // Calculate perpendicular direction
      const perpX = -tangent.z;
      const perpZ = tangent.x;

      // Get interpolated width
      const width = this.getWidthAtT(t % 1);
      const halfWidth = width / 2;

      // Left edge vertex
      vertices.push(
        point.x - perpX * halfWidth,
        0.02,
        point.z - perpZ * halfWidth
      );

      // Right edge vertex
      vertices.push(
        point.x + perpX * halfWidth,
        0.02,
        point.z + perpZ * halfWidth
      );

      // Determine segment color (alternate every N points for visual effect)
      const segmentIndex = Math.floor(t * waypoints.length);
      const color = segmentIndex % 2 === 0 ? midColor : darkColor;

      // Add colors for both vertices
      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);
    }

    // Generate triangle indices
    for (let i = 0; i < numSegments; i++) {
      const baseIndex = i * 2;

      // First triangle
      indices.push(baseIndex, baseIndex + 2, baseIndex + 1);
      // Second triangle
      indices.push(baseIndex + 1, baseIndex + 2, baseIndex + 3);
    }

    // Create buffer geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // Create material with vertex colors
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
    });

    const trackMesh = new THREE.Mesh(geometry, material);
    trackMesh.receiveShadow = true;
    this.scene.add(trackMesh);

    // Add checkpoint markings
    for (let i = 0; i < waypoints.length; i++) {
      if (waypoints[i].isCheckpoint) {
        const t = i / waypoints.length;
        const point = this.trackCurve.getPoint(t);
        const tangent = this.trackCurve.getTangent(t);
        const rotation = Math.atan2(tangent.x, tangent.z);
        this.addCheckpointMarking(point.x, point.z, rotation, waypoints[i].width);
      }
    }
  }

  private addCheckpointMarking(x: number, z: number, rotation: number, width: number): void {
    const lineGeo = new THREE.PlaneGeometry(width, 1);
    const lineMat = new THREE.MeshBasicMaterial({
      color: PIXEL_COLORS.yellow,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = rotation;
    line.position.set(x, 0.03, z);
    this.scene.add(line);
  }

  private createBarriers(): void {
    const barrierGeo = new THREE.BoxGeometry(3, 1.5, 3);
    const redMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.red,
      flatShading: true,
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.white,
      flatShading: true,
    });

    // Create physics bodies for barriers
    const barrierShape = new CANNON.Box(new CANNON.Vec3(1.5, 0.75, 1.5));

    let colorIndex = 0;

    // Inner barriers
    for (const barrier of this.trackData.innerBarriers) {
      const mat = colorIndex % 2 === 0 ? redMat : whiteMat;
      this.createBarrier(barrier.x, barrier.z, barrier.rotation, barrierGeo, mat, barrierShape);
      colorIndex++;
    }

    // Outer barriers (offset color pattern)
    colorIndex = 1;
    for (const barrier of this.trackData.outerBarriers) {
      const mat = colorIndex % 2 === 0 ? redMat : whiteMat;
      this.createBarrier(barrier.x, barrier.z, barrier.rotation, barrierGeo, mat, barrierShape);
      colorIndex++;
    }
  }

  private createBarrier(
    x: number,
    z: number,
    rotation: number,
    geo: THREE.BoxGeometry,
    mat: THREE.Material,
    shape: CANNON.Box
  ): void {
    // Visual mesh
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.75, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Physics body
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      material: this.barrierMaterial,
    });
    body.position.set(x, 0.75, z);
    body.quaternion.setFromEuler(0, rotation, 0);
    this.world.addBody(body);
    this.barrierBodies.push(body);
  }

  private createStartFinishLine(): void {
    const start = this.trackData.startPosition;
    const width = this.trackData.waypoints[0].width;

    // Main line
    const lineGeo = new THREE.PlaneGeometry(width, 3);
    const lineMat = new THREE.MeshBasicMaterial({ color: PIXEL_COLORS.white });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(start.x, 0.03, start.z);
    this.scene.add(line);

    // Checkered pattern
    const checkerGeo = new THREE.PlaneGeometry(width / 10, 3);
    const checkerMat = new THREE.MeshBasicMaterial({ color: PIXEL_COLORS.black });
    for (let i = 0; i < 10; i += 2) {
      const checker = new THREE.Mesh(checkerGeo, checkerMat);
      checker.rotation.x = -Math.PI / 2;
      checker.position.set(start.x - width / 2 + (i + 0.5) * (width / 10), 0.04, start.z);
      this.scene.add(checker);
    }
  }

  public getMinimapData(): MinimapData {
    if (!this.trackCurve) {
      this.generateTrackCurve();
    }

    const waypoints = this.trackData.waypoints;
    const numPoints = 100;

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const centerPoints: { x: number; z: number }[] = [];
    const innerPoints: { x: number; z: number }[] = [];
    const outerPoints: { x: number; z: number }[] = [];

    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      const point = this.trackCurve!.getPoint(t);
      const tangent = this.trackCurve!.getTangent(t);

      const perpX = -tangent.z;
      const perpZ = tangent.x;

      const width = this.getWidthAtT(t);
      const halfWidth = width / 2;

      // Center point
      centerPoints.push({ x: point.x, z: point.z });

      // Inner edge
      innerPoints.push({
        x: point.x + perpX * halfWidth,
        z: point.z + perpZ * halfWidth,
      });

      // Outer edge
      outerPoints.push({
        x: point.x - perpX * halfWidth,
        z: point.z - perpZ * halfWidth,
      });

      // Update bounds
      const margin = halfWidth + 5;
      minX = Math.min(minX, point.x - margin);
      maxX = Math.max(maxX, point.x + margin);
      minZ = Math.min(minZ, point.z - margin);
      maxZ = Math.max(maxZ, point.z + margin);
    }

    // Generate SVG paths
    const centerPath = this.pointsToSVGPath(centerPoints);
    const innerPath = this.pointsToSVGPath(innerPoints);
    const outerPath = this.pointsToSVGPath(outerPoints);

    return {
      centerPath,
      innerPath,
      outerPath,
      bounds: { minX, maxX, minZ, maxZ },
    };
  }

  private pointsToSVGPath(points: { x: number; z: number }[]): string {
    if (points.length === 0) return '';

    let path = `M ${points[0].x} ${points[0].z}`;

    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].z}`;
    }

    path += ' Z'; // Close the path

    return path;
  }

  public getBarrierMaterial(): CANNON.Material {
    return this.barrierMaterial;
  }

  public getWaypoints(): TrackWaypoint[] {
    return this.trackData.waypoints;
  }

  public getStartPosition(): { x: number; z: number; rotation: number } {
    return this.trackData.startPosition;
  }

  public getAIStartPositions(count: number): { x: number; z: number; rotation: number }[] {
    const positions: { x: number; z: number; rotation: number }[] = [];
    const start = this.trackData.startPosition;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      positions.push({
        x: start.x + (col === 0 ? -3 : 3),
        z: start.z - (row + 1) * 8,
        rotation: start.rotation,
      });
    }

    return positions;
  }
}
