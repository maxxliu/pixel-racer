import * as THREE from 'three';
import { PALETTE } from './palette';
import { TrackSpline, WALL_OFFSET } from './TrackSpline';
import { hash, noise2, buildSky, buildSun, buildClouds, buildMountains, type Disposable } from './SkyKit';

/** Sky, sun, clouds, ground, mountains, trees, boulders, grandstands. */
export class Environment {
  public readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly sunSprite: THREE.Mesh;
  private readonly clouds: THREE.Group;
  private readonly disposables: Disposable[] = [];
  private readonly flags: THREE.Mesh[] = [];

  constructor(private readonly spline: TrackSpline, quality: 'low' | 'medium' | 'high') {
    this.sky = buildSky(this.disposables).mesh;
    this.group.add(this.sky);
    this.sunSprite = buildSun(this.disposables);
    this.group.add(this.sunSprite);
    this.clouds = buildClouds(quality === 'low' ? 6 : 12, this.disposables);
    this.group.add(this.clouds);
    this.buildGround();
    const cx = (this.spline.bounds.minX + this.spline.bounds.maxX) / 2;
    const cz = (this.spline.bounds.minZ + this.spline.bounds.maxZ) / 2;
    this.group.add(buildMountains(cx, cz, this.disposables));
    this.buildTrees(quality === 'low' ? 140 : quality === 'medium' ? 260 : 380);
    this.buildBoulders(quality === 'low' ? 10 : 24);
    this.buildGrandstands();
  }

  private buildGround(): void {
    const size = 1500;
    const seg = 90;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color(PALETTE.grassA), b = new THREE.Color(PALETTE.grassB), dry = new THREE.Color(PALETTE.grassDry);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = noise2(x * 0.02, z * 0.02) * 0.7 + noise2(x * 0.08, z * 0.08) * 0.3;
      c.copy(a).lerp(b, n);
      const patches = noise2(x * 0.01 + 40, z * 0.01 - 20);
      if (patches > 0.68) c.lerp(dry, (patches - 0.68) * 2.2);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    const cx = (this.spline.bounds.minX + this.spline.bounds.maxX) / 2;
    const cz = (this.spline.bounds.minZ + this.spline.bounds.maxZ) / 2;
    mesh.position.set(cx, 0, cz);
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private farFromTrack(x: number, z: number, margin: number): boolean {
    const n = this.spline.nearest(x, z);
    return n.distance > this.spline.halfWidthAt(n.index) + WALL_OFFSET + margin;
  }

  private buildTrees(count: number): void {
    const b = this.spline.bounds;
    const pad = 130;
    const cone = new THREE.ConeGeometry(2.4, 6.5, 6);
    cone.translate(0, 5.2, 0);
    const cone2 = new THREE.ConeGeometry(1.7, 4.5, 6);
    cone2.translate(0, 8.2, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6);
    trunk.translate(0, 1.2, 0);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: false });
    const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
    const leaves = new THREE.InstancedMesh(cone, leafMat, count);
    const leaves2 = new THREE.InstancedMesh(cone2, leafMat, count);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, count);
    leaves.castShadow = leaves2.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const green = new THREE.Color(PALETTE.treeGreen), dark = new THREE.Color(PALETTE.treeDark), warm = new THREE.Color(0x8fa84a);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const x = b.minX - pad + hash(tries, 17) * (b.maxX - b.minX + pad * 2);
      const z = b.minZ - pad + hash(tries, 23) * (b.maxZ - b.minZ + pad * 2);
      if (!this.farFromTrack(x, z, 9)) continue;
      const scale = 0.7 + hash(tries, 5) * 0.8;
      p.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(tries, 8) * Math.PI * 2);
      s.set(scale, scale * (0.85 + hash(tries, 9) * 0.5), scale);
      m.compose(p, q, s);
      leaves.setMatrixAt(placed, m);
      leaves2.setMatrixAt(placed, m);
      trunks.setMatrixAt(placed, m);
      c.copy(green).lerp(dark, hash(tries, 11)).lerp(warm, hash(tries, 12) * 0.35);
      leaves.setColorAt(placed, c);
      leaves2.setColorAt(placed, c.clone().multiplyScalar(1.12));
      placed++;
    }
    leaves.count = leaves2.count = trunks.count = placed;
    leaves.instanceMatrix.needsUpdate = true;
    leaves2.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    if (leaves2.instanceColor) leaves2.instanceColor.needsUpdate = true;
    this.group.add(leaves, leaves2, trunks);
    this.disposables.push(cone, cone2, trunk, leafMat, trunkMat);
  }

  private buildBoulders(count: number): void {
    const geo = new THREE.DodecahedronGeometry(1.6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 0.95, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    const m = new THREE.Matrix4();
    const b = this.spline.bounds;
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      const x = b.minX - 40 + hash(tries, 31) * (b.maxX - b.minX + 80);
      const z = b.minZ - 40 + hash(tries, 37) * (b.maxZ - b.minZ + 80);
      if (!this.farFromTrack(x, z, 4)) continue;
      const s = 0.6 + hash(tries, 41) * 1.6;
      m.makeRotationY(hash(tries, 43) * 6.28);
      m.scale(new THREE.Vector3(s, s * 0.7, s));
      m.setPosition(x, -0.3 * s, z);
      mesh.setMatrixAt(placed++, m);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildGrandstands(): void {
    // Find the two straightest stretches (lowest curvature over 60 m windows).
    const samples = this.spline.samples;
    const n = samples.length;
    const win = Math.max(8, Math.round(60 / this.spline.spacing));
    const scores: { i: number; k: number }[] = [];
    for (let i = 0; i < n; i += Math.max(1, Math.floor(win / 2))) {
      let k = 0;
      for (let j = 0; j < win; j++) k += Math.abs(samples[(i + j) % n].curvature);
      scores.push({ i, k });
    }
    scores.sort((a, b) => a.k - b.k);
    const chosen: number[] = [];
    for (const s of scores) {
      if (chosen.length >= 3) break;
      if (chosen.every((c) => Math.min(Math.abs(c - s.i), n - Math.abs(c - s.i)) > win * 2)) chosen.push(s.i);
    }
    const crowdGeo = new THREE.BoxGeometry(0.7, 1.1, 0.6);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const total = chosen.length * 5 * 30;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, total);
    const crowdColors = [0xff5c4d, 0x3fb6ff, 0xc8ff3d, 0xffd166, 0xff7ab8, 0xfff7ef, 0xb38cff];
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let ci = 0;
    const standMat = new THREE.MeshStandardMaterial({ color: 0x4b3a6b, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf8f3ea, roughness: 0.6 });
    const flagMat = new THREE.MeshStandardMaterial({ color: PALETTE.player, side: THREE.DoubleSide, roughness: 0.7 });
    chosen.forEach((start, si) => {
      const mid = samples[(start + Math.floor(win / 2)) % n];
      const side = si % 2 === 0 ? 1 : -1;
      const off = mid.width / 2 + WALL_OFFSET + 9;
      const g = new THREE.Group();
      g.position.set(mid.x + mid.nx * off * side, 0, mid.z + mid.nz * off * side);
      // face the track: local +z should point toward the road
      g.rotation.y = Math.atan2(-mid.nx * side, -mid.nz * side);
      const width = 44, tiers = 5;
      for (let t = 0; t < tiers; t++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 2.6), standMat);
        step.position.set(0, t * 1.1 + 0.55, -t * 2.4);
        step.receiveShadow = true;
        step.castShadow = true;
        g.add(step);
        this.disposables.push(step.geometry);
        for (let k = 0; k < 30; k++) {
          if (hash(si * 100 + t, k) < 0.12) continue;
          m.makeTranslation(0, 0, 0);
          const wx = -width / 2 + 1.5 + k * ((width - 3) / 29);
          const wz = -t * 2.4 + 0.2;
          const local = new THREE.Vector3(wx, t * 1.1 + 1.65, wz).applyEuler(g.rotation).add(g.position);
          m.makeRotationY(g.rotation.y);
          m.setPosition(local);
          crowd.setMatrixAt(ci, m);
          c.setHex(crowdColors[Math.floor(hash(k, t + si * 7) * crowdColors.length)]);
          crowd.setColorAt(ci, c);
          ci++;
        }
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 0.4, tiers * 2.4 + 2), roofMat);
      roof.position.set(0, tiers * 1.1 + 4.2, -(tiers * 2.4) / 2 + 1);
      roof.rotation.x = -0.12;
      roof.castShadow = true;
      g.add(roof);
      this.disposables.push(roof.geometry);
      for (const px of [-width / 2 - 0.5, width / 2 + 0.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, tiers * 1.1 + 4.4, 8), roofMat);
        pole.position.set(px, (tiers * 1.1 + 4.4) / 2, 1.2);
        g.add(pole);
        this.disposables.push(pole.geometry);
      }
      // flags along the front
      for (let f = 0; f < 5; f++) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), roofMat);
        pole.position.set(-width / 2 + 4 + f * (width - 8) / 4, 2, 2.2);
        g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), flagMat);
        flag.position.set(0.8, 1.5, 0);
        pole.add(flag);
        this.flags.push(flag);
        this.disposables.push(pole.geometry, flag.geometry);
      }
      this.group.add(g);
    });
    crowd.count = ci;
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    crowd.castShadow = true;
    this.group.add(crowd);
    this.disposables.push(crowdGeo, crowdMat, standMat, roofMat, flagMat);
  }

  /** Keep sky/sun centred on the camera; wave flags; drift clouds. */
  public update(cameraPos: THREE.Vector3, time: number): void {
    this.sky.position.copy(cameraPos);
    this.sunSprite.position.set(cameraPos.x - 520, 150, cameraPos.z - 480);
    this.sunSprite.lookAt(cameraPos);
    this.clouds.position.set(cameraPos.x * 0.9, 0, cameraPos.z * 0.9);
    this.clouds.rotation.y = time * 0.004;
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].rotation.y = Math.sin(time * 3 + i) * 0.35;
    }
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
    this.disposables.forEach((d) => d.dispose());
  }
}
