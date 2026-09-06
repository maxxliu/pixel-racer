/**
 * Shared builders for the sunset backdrop (sky dome, sun, clouds, mountain rings,
 * noise-coloured ground) used by both the circuit `Environment` and the endless
 * mode's camera-relative `StreamEnvironment`.
 */
import * as THREE from 'three';
import { PALETTE } from './palette';

export type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;

export function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function noise2(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export type SkyUniforms = {
  top: { value: THREE.Color };
  mid: { value: THREE.Color };
  horizon: { value: THREE.Color };
} & Record<string, THREE.IUniform>;

export function buildSky(out: Disposable[]): { mesh: THREE.Mesh; uniforms: SkyUniforms } {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const uniforms: SkyUniforms = {
    top: { value: new THREE.Color(PALETTE.skyTop) },
    mid: { value: new THREE.Color(PALETTE.skyMid) },
    horizon: { value: new THREE.Color(PALETTE.horizon) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 c = h < 0.18 ? mix(horizon, mid, smoothstep(-0.05, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.8, h));
        // subtle sun-side warmth
        float warm = pow(max(0.0, dot(normalize(vDir), normalize(vec3(-0.6, 0.18, -0.55)))), 6.0);
        c = mix(c, vec3(1.0, 0.72, 0.45), warm * 0.55);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  out.push(geo, mat);
  return { mesh, uniforms };
}

export function buildSun(out: Disposable[]): THREE.Mesh {
  const geo = new THREE.CircleGeometry(48, 40);
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false, toneMapped: false });
  const sun = new THREE.Mesh(geo, mat);
  const glowGeo = new THREE.CircleGeometry(110, 40);
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow, transparent: true, opacity: 0.28, fog: false, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.z = 2;
  sun.add(glow);
  sun.renderOrder = -9;
  out.push(geo, mat, glowGeo, glowMat);
  return sun;
}

export function buildClouds(count: number, out: Disposable[]): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd7c2, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  const puff = new THREE.SphereGeometry(1, 7, 5);
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const parts = 3 + Math.floor(hash(i, 1) * 3);
    for (let p = 0; p < parts; p++) {
      const m = new THREE.Mesh(puff, mat);
      const s = 10 + hash(i, p + 2) * 14;
      m.scale.set(s * 1.6, s * 0.55, s);
      m.position.set((p - parts / 2) * s * 1.1, hash(i, p + 9) * 4, 0);
      cloud.add(m);
    }
    const ang = (i / count) * Math.PI * 2 + hash(i, 3);
    const r = 600 + hash(i, 4) * 150;
    cloud.position.set(Math.cos(ang) * r, 70 + hash(i, 5) * 60, Math.sin(ang) * r);
    g.add(cloud);
  }
  out.push(mat, puff);
  return g;
}

/** Two rings of jagged silhouettes around (cx, cz). */
export function buildMountains(cx: number, cz: number, out: Disposable[]): THREE.Group {
  const group = new THREE.Group();
  const ring = (radius: number, minH: number, maxH: number, color: number, seed: number, steps: number) => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const h = minH + (noise2(i * 0.35 + seed, seed) * 0.6 + noise2(i * 1.3 + seed, seed * 2) * 0.4) * (maxH - minH);
      const x = cx + Math.cos(t) * radius, z = cz + Math.sin(t) * radius;
      positions.push(x, -5, z, x, h, z);
      if (i > 0) {
        const a = (i - 1) * 2, b = i * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    out.push(geo, mat);
  };
  ring(560, 40, 150, PALETTE.mountainFar, 3, 90);
  ring(420, 25, 95, PALETTE.mountainNear, 11, 110);
  return group;
}

/** A flat plane whose vertex colours are noise-shaded grass. `colorGround` paints it for a world centre. */
export function buildGround(size: number, seg: number, out: Disposable[]): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  out.push(geo, mat);
  return mesh;
}

/** Paint ground vertex colours from world coordinates so re-centring the plane keeps the pattern fixed. */
export function colorGround(mesh: THREE.Mesh, cx: number, cz: number): void {
  const geo = mesh.geometry as THREE.PlaneGeometry;
  const pos = geo.attributes.position;
  const colors = geo.attributes.color as THREE.BufferAttribute;
  const a = new THREE.Color(PALETTE.grassA), b = new THREE.Color(PALETTE.grassB), dry = new THREE.Color(PALETTE.grassDry);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const n = noise2(x * 0.02, z * 0.02) * 0.7 + noise2(x * 0.08, z * 0.08) * 0.3;
    c.copy(a).lerp(b, n);
    const patches = noise2(x * 0.01 + 40, z * 0.01 - 20);
    if (patches > 0.68) c.lerp(dry, (patches - 0.68) * 2.2);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
  mesh.position.set(cx, 0, cz);
}
