import * as THREE from 'three';
import { PALETTE } from './palette';
import type { ArcadeCar } from './ArcadeCar';

const WHEEL_RADIUS = 0.36;

export interface CarVisual {
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  frontPivots: THREE.Group[];
  brakeMat: THREE.MeshStandardMaterial;
  exhaustLocal: THREE.Vector3;
  rearWheelsLocal: THREE.Vector3[];
  dispose(): void;
}

let sharedGeo: {
  wheel: THREE.CylinderGeometry;
  hub: THREE.CylinderGeometry;
} | null = null;

function geo() {
  if (!sharedGeo) {
    sharedGeo = {
      wheel: new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 14),
      hub: new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8),
    };
  }
  return sharedGeo;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  return m;
}

/** Low-poly hatchback. Forward is +Z in local space; wheels sit on y=0. */
export function buildCarMesh(color: number): CarVisual {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.tyre, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.2, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d2e0, roughness: 0.35, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: PALETTE.headlight, emissive: PALETTE.headlight, emissiveIntensity: 1.2 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: PALETTE.brakeLight, emissiveIntensity: 0.15 });

  const ride = WHEEL_RADIUS; // body base height
  // main tub
  body.add(box(1.9, 0.5, 4.0, paint, 0, ride + 0.25, 0));
  // lower skirt / bumpers
  body.add(box(2.0, 0.22, 4.2, dark, 0, ride + 0.05, 0));
  // hood wedge (a tilted box reads as a slope in low-poly)
  const hood = box(1.7, 0.28, 1.5, paint, 0, ride + 0.6, 1.05);
  hood.rotation.x = 0.18;
  body.add(hood);
  // cabin
  const cabin = box(1.5, 0.55, 1.7, glass, 0, ride + 0.82, -0.25);
  body.add(cabin);
  body.add(box(1.56, 0.08, 1.76, paint, 0, ride + 1.12, -0.25)); // roof
  // pillars tint
  body.add(box(1.52, 0.5, 0.12, paint, 0, ride + 0.8, -1.15));
  // rear deck
  body.add(box(1.7, 0.3, 0.9, paint, 0, ride + 0.62, -1.55));
  // spoiler
  body.add(box(1.8, 0.06, 0.4, dark, 0, ride + 1.05, -1.9));
  body.add(box(0.08, 0.32, 0.25, dark, -0.7, ride + 0.86, -1.9));
  body.add(box(0.08, 0.32, 0.25, dark, 0.7, ride + 0.86, -1.9));
  // headlights
  body.add(box(0.42, 0.16, 0.08, headMat, -0.62, ride + 0.42, 2.02, false));
  body.add(box(0.42, 0.16, 0.08, headMat, 0.62, ride + 0.42, 2.02, false));
  // tail lights
  body.add(box(0.5, 0.14, 0.08, brakeMat, -0.6, ride + 0.48, -2.02, false));
  body.add(box(0.5, 0.14, 0.08, brakeMat, 0.6, ride + 0.48, -2.02, false));
  // exhaust
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), chrome);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.55, ride + 0.12, -2.1);
  body.add(exhaust);
  // racing stripe
  body.add(box(0.36, 0.02, 3.9, new THREE.MeshStandardMaterial({ color: 0xfff4e6, roughness: 0.6 }), 0, ride + 0.51, 0, false));

  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const positions = [
    { x: -0.92, z: 1.3, front: true },
    { x: 0.92, z: 1.3, front: true },
    { x: -0.92, z: -1.3, front: false },
    { x: 0.92, z: -1.3, front: false },
  ];
  for (const p of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(p.x, WHEEL_RADIUS, p.z);
    const wheel = new THREE.Mesh(geo().wheel, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    const hub = new THREE.Mesh(geo().hub, chrome);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (p.front) frontPivots.push(pivot);
  }

  const mats = [paint, dark, glass, chrome, headMat, brakeMat];
  return {
    group, body, wheels, frontPivots, brakeMat,
    exhaustLocal: new THREE.Vector3(0.55, ride + 0.12, -2.25),
    rearWheelsLocal: [new THREE.Vector3(-0.92, 0.02, -1.3), new THREE.Vector3(0.92, 0.02, -1.3)],
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== geo().wheel && m.geometry !== geo().hub) m.geometry.dispose();
      });
      mats.forEach((m) => m.dispose());
    },
  };
}

/** Interpolated pose between the previous and current physics step. */
export function interpolatePose(car: ArcadeCar, alpha: number): { x: number; z: number; heading: number } {
  let dh = car.heading - car.prevHeading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return {
    x: car.prevX + (car.x - car.prevX) * alpha,
    z: car.prevZ + (car.z - car.prevZ) * alpha,
    heading: car.prevHeading + dh * alpha,
  };
}

/** Apply pose + visual body dynamics (roll, pitch, steering, wheel spin, brake lights). */
export function updateCarVisual(v: CarVisual, car: ArcadeCar, alpha: number, dt: number): void {
  const pose = interpolatePose(car, alpha);
  v.group.position.set(pose.x, 0, pose.z);
  v.group.rotation.y = pose.heading;
  // body tilt
  const targetRoll = THREE.MathUtils.clamp(car.accelL * 0.012 + car.lateralSpeed * 0.01, -0.12, 0.12);
  const targetPitch = THREE.MathUtils.clamp(-car.accelF * 0.006, -0.06, 0.08);
  const k = 1 - Math.exp(-dt * 10);
  v.body.rotation.z += (targetRoll - v.body.rotation.z) * k;
  v.body.rotation.x += (targetPitch - v.body.rotation.x) * k;
  // wheels
  for (const w of v.wheels) w.rotation.x = car.wheelSpin;
  for (const p of v.frontPivots) p.rotation.y = -car.steer * 0.45;
  // lights
  const braking = car.braking || (car.throttle < 0 && car.forwardSpeed > 1) || car.handbrake;
  v.brakeMat.emissiveIntensity += ((braking ? 2.2 : 0.15) - v.brakeMat.emissiveIntensity) * Math.min(1, dt * 20);
}
