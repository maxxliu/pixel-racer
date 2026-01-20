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

// F1 Professional Racing color palette
const PIXEL_COLORS = {
  black: 0x171717,    // Carbon black
  dark: 0x262626,     // Charcoal - panels
  mid: 0x404040,      // Slate - track surface
  light: 0x737373,    // Inactive UI
  red: 0xdc2626,      // Racing red - barriers
  orange: 0xea580c,   // McLaren orange
  yellow: 0xfbbf24,   // Caution yellow
  green: 0x1f2937,    // Dark blue-gray - ground
  cyan: 0x525252,     // Neutral
  blue: 0x2563eb,     // Williams blue
  purple: 0x525252,   // Neutral
  pink: 0xdc2626,     // Same as red
  white: 0xffffff,    // Pure white - barriers
  gray: 0xa3a3a3,     // Chrome silver
  asphalt: 0x333333,  // Track asphalt primary
  asphaltAlt: 0x404040, // Track asphalt alternate
};

export interface TrackBuilderOptions {
  customWaypoints?: TrackWaypoint[];
  customStartPosition?: { x: number; z: number; rotation: number };
}

export class TrackBuilder {
  private scene: THREE.Scene;
  private world: CANNON.World;
  private trackData: TrackData;
  private barrierBodies: CANNON.Body[] = [];
  private barrierMaterial: CANNON.Material;
  private options: TrackBuilderOptions;

  // Curve-based track generation
  private trackCurve: THREE.CatmullRomCurve3 | null = null;
  private curvePoints: THREE.Vector3[] = [];
  private readonly CURVE_SEGMENTS = 200; // Points along the curve

  constructor(scene: THREE.Scene, world: CANNON.World, options?: TrackBuilderOptions) {
    this.scene = scene;
    this.world = world;
    this.options = options || {};
    this.barrierMaterial = new CANNON.Material('barrier');

    // Use custom waypoints if provided, otherwise generate default track
    if (this.options.customWaypoints && this.options.customWaypoints.length > 0) {
      this.trackData = this.createTrackFromWaypoints(
        this.options.customWaypoints,
        this.options.customStartPosition
      );
    } else {
      this.trackData = this.generateTrackData();
    }
  }

  private createTrackFromWaypoints(
    waypoints: TrackWaypoint[],
    startPosition?: { x: number; z: number; rotation: number }
  ): TrackData {
    // Generate curve for barrier positions
    const points = waypoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
    const tempCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);

    // Generate barriers along the smooth curve
    const { innerBarriers, outerBarriers } = this.generateBarrierPositions(waypoints, tempCurve);

    // Calculate start position if not provided
    const calculatedStart = startPosition || this.calculateStartFromWaypoints(waypoints, tempCurve);

    return {
      waypoints,
      startPosition: calculatedStart,
      innerBarriers,
      outerBarriers,
    };
  }

  private calculateStartFromWaypoints(
    waypoints: TrackWaypoint[],
    curve: THREE.CatmullRomCurve3
  ): { x: number; z: number; rotation: number } {
    // Find first checkpoint or use first waypoint
    const startIndex = waypoints.findIndex(wp => wp.isCheckpoint);
    const idx = startIndex >= 0 ? startIndex : 0;

    const t = idx / waypoints.length;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const rotation = Math.atan2(tangent.x, tangent.z);

    return {
      x: point.x,
      z: point.z,
      rotation
    };
  }

  private generateTrackCurve(): void {
    const points = this.trackData.waypoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
    this.trackCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
    this.curvePoints = this.trackCurve.getPoints(this.CURVE_SEGMENTS);
  }

  private getWidthAtT(t: number): number {
    // Use the same smooth interpolation as barriers for alignment
    return this.getWidthAtCurveT(t, this.trackData.waypoints);
  }

  private generateTrackData(): TrackData {
    // Challenging F1-style circuit with technical sections
    // Requires proper braking and racing line discipline
    const waypoints: TrackWaypoint[] = [
      // === START/FINISH STRAIGHT (x=0, heading north) ===
      { x: 0, z: 0, width: 16, speedLimit: 180, isCheckpoint: true },
      { x: 0, z: 40, width: 16, speedLimit: 180 },
      { x: 0, z: 80, width: 14, speedLimit: 120 },  // Braking zone

      // === TURN 1: Tight chicane complex (x=20-120, z=95-120) ===
      { x: 25, z: 100, width: 13, speedLimit: 90 },
      { x: 55, z: 115, width: 12, speedLimit: 70, isCheckpoint: true },
      { x: 72, z: 105, width: 10, speedLimit: 55 },   // Tight chicane left (narrowed)
      { x: 88, z: 118, width: 10, speedLimit: 55 },   // Tight chicane right (narrowed)
      { x: 110, z: 108, width: 11, speedLimit: 65 },  // Exit - still technical
      { x: 125, z: 95, width: 13, speedLimit: 100 },  // Opening up

      // === BACK STRAIGHT with aggressive S-curves (x=135-160, z=-10 to 85) ===
      { x: 145, z: 75, width: 14, speedLimit: 130 },
      { x: 160, z: 50, width: 13, speedLimit: 100 },
      { x: 148, z: 30, width: 11, speedLimit: 70 },   // Esses - tight left
      { x: 162, z: 10, width: 11, speedLimit: 70 },   // Esses - tight right
      { x: 150, z: -10, width: 12, speedLimit: 85, isCheckpoint: true },

      // === TURN 2: Technical hairpin (x=20-130, z=-60 to -25) ===
      { x: 125, z: -30, width: 12, speedLimit: 55 },  // Entry braking
      { x: 100, z: -48, width: 11, speedLimit: 45 },  // Approaching apex
      { x: 70, z: -58, width: 10, speedLimit: 38 },   // Tight hairpin apex
      { x: 40, z: -55, width: 10, speedLimit: 40, isCheckpoint: true },  // Mid hairpin
      { x: 20, z: -42, width: 11, speedLimit: 55 },   // Exit phase

      // === FINAL APPROACH (x=5-15, z=-30 to -10) ===
      { x: 8, z: -25, width: 13, speedLimit: 90 },
      { x: 5, z: -12, width: 14, speedLimit: 120 },   // Accelerating to finish
      // CatmullRom closes back to (0, 0)
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
    const barrierOffset = 2.5; // Distance from track edge to barrier center (accounts for barrier half-width of 2)

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
    const barrierOffset = 2.5; // Distance from track edge to barrier center (accounts for barrier half-width of 2)
    const minBarrierDistance = 3.5; // Minimum distance between adjacent barriers

    for (let i = 0; i < targetCount; i++) {
      const t = i / targetCount;
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);

      const perpX = -tangent.z;
      const perpZ = tangent.x;

      const width = this.getWidthAtCurveT(t, waypoints);
      const halfWidth = width / 2;

      const rotation = Math.atan2(tangent.x, tangent.z);

      const x = point.x + side * perpX * (halfWidth + barrierOffset);
      const z = point.z + side * perpZ * (halfWidth + barrierOffset);

      // Check distance from last placed barrier to prevent overlap on tight curves
      if (result.length > 0) {
        const last = result[result.length - 1];
        const dist = Math.sqrt((x - last.x) ** 2 + (z - last.z) ** 2);
        if (dist < minBarrierDistance) continue; // Skip this barrier
      }

      result.push({ x, z, rotation });
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
    // Create grass with striped texture (like mowed lawn)
    const stripeWidth = 20; // Width of each grass stripe
    const groundSize = 500;
    const numStripes = Math.ceil(groundSize / stripeWidth);

    // Grass colors - alternating light and dark green
    const grassDark = 0x15803d;
    const grassLight = 0x22c55e;

    // Create striped grass ground
    for (let i = 0; i < numStripes; i++) {
      const stripeGeo = new THREE.PlaneGeometry(groundSize, stripeWidth);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? grassDark : grassLight,
        flatShading: true,
        roughness: 1.0,
        metalness: 0.0,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0, -groundSize / 2 + stripeWidth / 2 + i * stripeWidth);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    }

    // Create sky dome
    this.createSky();

    // Create grandstands along the track
    this.createGrandstands();
  }

  private createSky(): void {
    // Sky gradient dome
    const skyGeo = new THREE.SphereGeometry(400, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x1a4d7c) },
        bottomColor: { value: new THREE.Color(0x87CEEB) },
        offset: { value: 10 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Sun
    const sunGeo = new THREE.CircleGeometry(20, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFE87C });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(150, 180, -200);
    sun.lookAt(0, 0, 0);
    this.scene.add(sun);

    // Sun glow
    const glowGeo = new THREE.CircleGeometry(40, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xFFFF99,
      transparent: true,
      opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(150, 180, -199);
    glow.lookAt(0, 0, 0);
    this.scene.add(glow);

    // Clouds
    this.createCloud(80, 120, -150, 30);
    this.createCloud(-100, 100, -180, 25);
    this.createCloud(200, 90, -160, 20);
    this.createCloud(-50, 130, -140, 35);
  }

  private createCloud(x: number, y: number, z: number, size: number): void {
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Create puffy cloud from multiple spheres
    const positions = [
      { x: 0, y: 0, z: 0, s: 1 },
      { x: size * 0.5, y: size * 0.1, z: 0, s: 0.8 },
      { x: -size * 0.4, y: size * 0.05, z: 0, s: 0.7 },
      { x: size * 0.2, y: size * 0.3, z: 0, s: 0.6 },
      { x: -size * 0.2, y: size * 0.2, z: 0, s: 0.5 },
    ];

    positions.forEach(pos => {
      const sphereGeo = new THREE.SphereGeometry(size * pos.s * 0.4, 8, 8);
      const sphere = new THREE.Mesh(sphereGeo, cloudMat);
      sphere.position.set(pos.x, pos.y, pos.z);
      cloudGroup.add(sphere);
    });

    cloudGroup.position.set(x, y, z);
    this.scene.add(cloudGroup);
  }

  private createGrandstands(): void {
    if (!this.trackCurve) return;

    // Place grandstands at specific points along the track
    const grandstandPositions = [
      { t: 0.05, side: 'left' as const },   // Near start
      { t: 0.05, side: 'right' as const },
      { t: 0.4, side: 'left' as const },    // Mid track
      { t: 0.7, side: 'right' as const },   // Far section
    ];

    grandstandPositions.forEach(({ t, side }) => {
      const point = this.trackCurve!.getPoint(t);
      const tangent = this.trackCurve!.getTangent(t);
      const width = this.getWidthAtT(t);

      // Calculate perpendicular direction (left side of track when traveling forward)
      const perpX = -tangent.z;
      const perpZ = tangent.x;

      // Position grandstand outside the track
      const offset = width / 2 + 25; // Distance from track center
      const x = point.x + (side === 'left' ? perpX : -perpX) * offset;
      const z = point.z + (side === 'left' ? perpZ : -perpZ) * offset;

      // Rotation: grandstand should face toward the track (toward point)
      // Direction from grandstand to track center
      const toTrackX = point.x - x;
      const toTrackZ = point.z - z;
      const rotation = Math.atan2(toTrackX, toTrackZ);

      this.createGrandstand(x, z, rotation);
    });
  }

  private createGrandstand(x: number, z: number, rotation: number): void {
    const standGroup = new THREE.Group();

    // Grandstand dimensions
    const width = 40;
    const depth = 15;
    const tierHeight = 3;
    const numTiers = 5;

    // Colors
    const tierColors = [0x8090a0, 0x90a0b0, 0xa0b0c0, 0xb0c0d0, 0xc0d0e0];
    const frontColor = 0x607080;
    const crowdColors = [0xef4444, 0x3b82f6, 0xfbbf24, 0x22c55e, 0xf97316, 0xa855f7];

    // Create tiers
    for (let tier = 0; tier < numTiers; tier++) {
      const tierDepth = depth * (1 - tier * 0.15);
      const tierY = tier * tierHeight;

      // Tier platform
      const platformGeo = new THREE.BoxGeometry(width, tierHeight * 0.3, tierDepth);
      const platformMat = new THREE.MeshStandardMaterial({
        color: tierColors[tier],
        flatShading: true,
        roughness: 1.0,
      });
      const platform = new THREE.Mesh(platformGeo, platformMat);
      platform.position.set(0, tierY + tierHeight * 0.15, -tier * 2);
      platform.castShadow = true;
      platform.receiveShadow = true;
      standGroup.add(platform);

      // Front face (riser)
      const riserGeo = new THREE.BoxGeometry(width, tierHeight * 0.7, 0.5);
      const riserMat = new THREE.MeshStandardMaterial({
        color: frontColor,
        flatShading: true,
        roughness: 1.0,
      });
      const riser = new THREE.Mesh(riserGeo, riserMat);
      riser.position.set(0, tierY + tierHeight * 0.35, tierDepth / 2 - tier * 2);
      standGroup.add(riser);

      // Add crowd (colored boxes)
      const crowdSpacing = 2;
      const cols = Math.floor(width / crowdSpacing) - 1;
      const rows = Math.floor(tierDepth / crowdSpacing) - 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Use deterministic "random" based on position
          const seed = (tier * 1000 + row * 100 + col) * 9999;
          const rand = Math.abs(Math.sin(seed)) ;

          if (rand < 0.85) { // 85% crowd density
            const crowdGeo = new THREE.BoxGeometry(1, 1.5, 1);
            const colorIdx = Math.floor(Math.abs(Math.sin(seed + 0.5)) * crowdColors.length);
            const crowdMat = new THREE.MeshStandardMaterial({
              color: crowdColors[colorIdx],
              flatShading: true,
              roughness: 1.0,
            });
            const person = new THREE.Mesh(crowdGeo, crowdMat);
            person.position.set(
              -width / 2 + crowdSpacing + col * crowdSpacing,
              tierY + tierHeight * 0.3 + 0.75,
              tierDepth / 2 - crowdSpacing - row * crowdSpacing - tier * 2
            );
            standGroup.add(person);
          }
        }
      }
    }

    // Back wall
    const backWallGeo = new THREE.BoxGeometry(width, numTiers * tierHeight, 2);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a,
      flatShading: true,
      roughness: 1.0,
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, numTiers * tierHeight / 2, -depth / 2 - numTiers * 2);
    standGroup.add(backWall);

    // Position and rotate the entire grandstand
    standGroup.position.set(x, 0, z);
    standGroup.rotation.y = rotation;
    this.scene.add(standGroup);
  }

  private createTrackSurface(): void {
    if (!this.trackCurve) return;

    const waypoints = this.trackData.waypoints;
    const numSegments = this.CURVE_SEGMENTS;

    // Build continuous track geometry
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Colors for alternating track segments (asphalt)
    const darkColor = new THREE.Color(PIXEL_COLORS.asphalt);
    const midColor = new THREE.Color(PIXEL_COLORS.asphaltAlt);

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

    // Create material with vertex colors - matte finish
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    const trackMesh = new THREE.Mesh(geometry, material);
    trackMesh.receiveShadow = true;
    this.scene.add(trackMesh);
  }

  private createBarriers(): void {
    // Thicker barriers to prevent tunneling at high speeds
    const barrierGeo = new THREE.BoxGeometry(4, 1.5, 3);
    const redMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.red,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: PIXEL_COLORS.white,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    // Create physics bodies for barriers (thicker in perpendicular direction)
    const barrierShape = new CANNON.Box(new CANNON.Vec3(2, 0.75, 1.5));

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
