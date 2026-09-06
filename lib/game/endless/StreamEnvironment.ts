/**
 * Camera-relative world for the endless road: sky, sun, clouds and mountains that
 * travel with the camera, a ground plane re-centred as the player moves, trees and
 * boulders streamed per chunk through instanced ring buffers, distance signs at
 * milestones, and a sky that slides toward dusk as the run goes on.
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';
import { WALL_OFFSET } from '../Road';
import { buildSky, buildSun, buildClouds, buildMountains, buildGround, colorGround, hash, type Disposable, type SkyUniforms } from '../SkyKit';
import type { Quality } from '@/lib/settings';
import type { StreamTrack, StreamChunk } from './StreamTrack';
import { ENDLESS_TUNING } from './tuning';

const GROUND_SIZE = 1500;
const GROUND_RECENTRE = 300;

class SlotPool {
  private free: number[] = [];
  constructor(public readonly capacity: number) {
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }
  take(): number | null { return this.free.pop() ?? null; }
  give(i: number): void { this.free.push(i); }
}

interface SignSlot {
  group: THREE.Group;
  tex: THREE.CanvasTexture;
  chunkId: number;
}

export class StreamEnvironment {
  public readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly skyUniforms: SkyUniforms;
  private readonly sunSprite: THREE.Mesh;
  private readonly clouds: THREE.Group;
  private readonly mountains: THREE.Group;
  private readonly ground: THREE.Mesh;
  private groundCentre = new THREE.Vector2(0, 0);
  private readonly disposables: Disposable[] = [];
  private readonly leaves: THREE.InstancedMesh;
  private readonly leaves2: THREE.InstancedMesh;
  private readonly trunks: THREE.InstancedMesh;
  private readonly boulders: THREE.InstancedMesh;
  private readonly treeSlots: SlotPool;
  private readonly boulderSlots: SlotPool;
  private readonly chunkTrees = new Map<number, number[]>();
  private readonly chunkBoulders = new Map<number, number[]>();
  private readonly signs: SignSlot[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private progress = 0;
  private unsubscribe: (() => void) | null = null;
  private readonly baseTop = new THREE.Color(PALETTE.skyTop);
  private readonly baseMid = new THREE.Color(PALETTE.skyMid);
  private readonly baseHorizon = new THREE.Color(PALETTE.horizon);
  private readonly duskTop = new THREE.Color(PALETTE.duskTop);
  private readonly duskMid = new THREE.Color(PALETTE.duskMid);
  private readonly duskHorizon = new THREE.Color(PALETTE.duskHorizon);

  constructor(private readonly scene: THREE.Scene, private readonly track: StreamTrack, quality: Quality) {
    const sky = buildSky(this.disposables);
    this.sky = sky.mesh;
    this.skyUniforms = sky.uniforms;
    this.group.add(this.sky);
    this.sunSprite = buildSun(this.disposables);
    this.group.add(this.sunSprite);
    this.clouds = buildClouds(quality === 'low' ? 6 : 12, this.disposables);
    this.group.add(this.clouds);
    this.mountains = buildMountains(0, 0, this.disposables);
    this.group.add(this.mountains);
    this.ground = buildGround(GROUND_SIZE, quality === 'low' ? 60 : 90, this.disposables);
    colorGround(this.ground, 0, 0);
    this.group.add(this.ground);

    const treeCap = quality === 'low' ? 220 : quality === 'medium' ? 380 : 520;
    const boulderCap = quality === 'low' ? 30 : 60;
    this.treeSlots = new SlotPool(treeCap);
    this.boulderSlots = new SlotPool(boulderCap);
    const cone = new THREE.ConeGeometry(2.4, 6.5, 6); cone.translate(0, 5.2, 0);
    const cone2 = new THREE.ConeGeometry(1.7, 4.5, 6); cone2.translate(0, 8.2, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6); trunk.translate(0, 1.2, 0);
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
    this.leaves = new THREE.InstancedMesh(cone, leafMat, treeCap);
    this.leaves2 = new THREE.InstancedMesh(cone2, leafMat, treeCap);
    this.trunks = new THREE.InstancedMesh(trunk, trunkMat, treeCap);
    this.leaves.castShadow = this.leaves2.castShadow = quality !== 'low';
    for (const m of [this.leaves, this.leaves2, this.trunks]) {
      m.frustumCulled = false;
      for (let i = 0; i < treeCap; i++) m.setMatrixAt(i, this.hidden);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(treeCap * 3), 3);
    this.leaves2.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(treeCap * 3), 3);
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 0.95, flatShading: true });
    this.boulders = new THREE.InstancedMesh(rockGeo, rockMat, boulderCap);
    this.boulders.frustumCulled = false;
    this.boulders.castShadow = quality !== 'low';
    for (let i = 0; i < boulderCap; i++) this.boulders.setMatrixAt(i, this.hidden);
    this.boulders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.leaves, this.leaves2, this.trunks, this.boulders);
    this.disposables.push(cone, cone2, trunk, leafMat, trunkMat, rockGeo, rockMat);

    scene.add(this.group);
    for (const chunk of track.chunks) this.populate(chunk);
    this.unsubscribe = track.on((e) => {
      if (e.type === 'chunk') this.populate(e.chunk);
      else this.retire(e.chunk);
    });
  }

  /** Shortest distance from a point to the road centreline within the window. */
  private distanceToRoad(x: number, z: number): number {
    let best = Infinity;
    const samples = this.track.samples;
    for (let i = 0; i < samples.length; i += 2) {
      const s = samples[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  private populate(chunk: StreamChunk): void {
    const track = this.track;
    const trees: number[] = [];
    const rocks: number[] = [];
    const green = new THREE.Color(PALETTE.treeGreen), dark = new THREE.Color(PALETTE.treeDark), warm = new THREE.Color(0x8fa84a);
    const lo = chunk.firstId - track.firstId;
    const hi = chunk.lastId - track.firstId;
    const every = 3; // samples between planting attempts (6 m)
    for (let i = lo; i <= hi; i += every) {
      const s = track.samples[i];
      if (!s) continue;
      for (const side of [-1, 1]) {
        const seed = chunk.firstId + i * 7 + (side + 1) * 31;
        if (hash(seed, 17) < 0.45) continue;
        const off = s.width / 2 + WALL_OFFSET + 10 + hash(seed, 23) * 70;
        const x = s.x + s.nx * off * side + (hash(seed, 29) - 0.5) * 6;
        const z = s.z + s.nz * off * side + (hash(seed, 31) - 0.5) * 6;
        if (this.distanceToRoad(x, z) < s.width / 2 + WALL_OFFSET + 8) continue;
        if (hash(seed, 37) < 0.1) {
          const slot = this.boulderSlots.take();
          if (slot === null) continue;
          const sc = 0.6 + hash(seed, 41) * 1.6;
          this.tmpM.makeRotationY(hash(seed, 43) * 6.28);
          this.tmpM.scale(this.tmpS.set(sc, sc * 0.7, sc));
          this.tmpM.setPosition(x, -0.3 * sc, z);
          this.boulders.setMatrixAt(slot, this.tmpM);
          rocks.push(slot);
        } else {
          const slot = this.treeSlots.take();
          if (slot === null) continue;
          const scale = 0.7 + hash(seed, 5) * 0.8;
          this.tmpP.set(x, 0, z);
          this.tmpQ.setFromAxisAngle(this.yAxis, hash(seed, 8) * Math.PI * 2);
          this.tmpS.set(scale, scale * (0.85 + hash(seed, 9) * 0.5), scale);
          this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
          this.leaves.setMatrixAt(slot, this.tmpM);
          this.leaves2.setMatrixAt(slot, this.tmpM);
          this.trunks.setMatrixAt(slot, this.tmpM);
          this.tmpC.copy(green).lerp(dark, hash(seed, 11)).lerp(warm, hash(seed, 12) * 0.35);
          this.leaves.setColorAt(slot, this.tmpC);
          this.leaves2.setColorAt(slot, this.tmpC.clone().multiplyScalar(1.12));
          trees.push(slot);
        }
      }
    }
    this.chunkTrees.set(chunk.id, trees);
    this.chunkBoulders.set(chunk.id, rocks);
    this.flagDirty();

    // a distance sign at every milestone inside this chunk
    const T = ENDLESS_TUNING;
    const first = Math.ceil((chunk.sStart - T.playerStart) / T.milestoneEvery) * T.milestoneEvery;
    for (let m = Math.max(T.milestoneEvery, first); m + T.playerStart < chunk.sEnd; m += T.milestoneEvery) {
      this.placeSign(m, chunk);
    }
  }

  private flagDirty(): void {
    for (const m of [this.leaves, this.leaves2, this.trunks, this.boulders]) m.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    if (this.leaves2.instanceColor) this.leaves2.instanceColor.needsUpdate = true;
  }

  private placeSign(metres: number, chunk: StreamChunk): void {
    const T = ENDLESS_TUNING;
    const s = this.track.sampleAt(metres + T.playerStart);
    let slot = this.signs.find((x) => x.chunkId < 0);
    if (!slot) {
      if (this.signs.length >= 4) slot = this.signs[0];
      else {
        const group = new THREE.Group();
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xf8f3ea, roughness: 0.5 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), poleMat);
        pole.position.y = 2.1;
        const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.12), [
          poleMat, poleMat, poleMat, poleMat,
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
        ]);
        board.position.y = 3.6;
        group.add(pole, board);
        this.disposables.push(pole.geometry, board.geometry, poleMat, tex);
        (board.material as THREE.Material[]).forEach((m) => this.disposables.push(m));
        this.group.add(group);
        slot = { group, tex, chunkId: -1 };
        this.signs.push(slot);
      }
    }
    const ctx = (slot.tex.image as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1a1030';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 244, 116);
      ctx.fillStyle = '#fff7ef';
      ctx.font = 'bold 64px "Chakra Petch", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(metres >= 1000 ? `${(metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1)} KM` : `${metres} M`, 128, 66);
      slot.tex.needsUpdate = true;
    }
    const off = s.width / 2 + WALL_OFFSET + 2.2;
    slot.group.position.set(s.x + s.nx * off, 0, s.z + s.nz * off);
    // face oncoming traffic (look back along the road)
    slot.group.rotation.y = Math.atan2(-s.tx, -s.tz);
    slot.group.visible = true;
    slot.chunkId = chunk.id;
  }

  private retire(chunk: StreamChunk): void {
    for (const slot of this.chunkTrees.get(chunk.id) ?? []) {
      this.leaves.setMatrixAt(slot, this.hidden);
      this.leaves2.setMatrixAt(slot, this.hidden);
      this.trunks.setMatrixAt(slot, this.hidden);
      this.treeSlots.give(slot);
    }
    for (const slot of this.chunkBoulders.get(chunk.id) ?? []) {
      this.boulders.setMatrixAt(slot, this.hidden);
      this.boulderSlots.give(slot);
    }
    this.chunkTrees.delete(chunk.id);
    this.chunkBoulders.delete(chunk.id);
    for (const sign of this.signs) if (sign.chunkId === chunk.id) { sign.chunkId = -1; sign.group.visible = false; }
    this.flagDirty();
  }

  /** 0 = golden hour, 1 = dusk. */
  public setProgress(p: number): void {
    const u = Math.min(1, Math.max(0, p));
    if (Math.abs(u - this.progress) < 0.002) return;
    this.progress = u;
    this.skyUniforms.top.value.copy(this.baseTop).lerp(this.duskTop, u);
    this.skyUniforms.mid.value.copy(this.baseMid).lerp(this.duskMid, u);
    this.skyUniforms.horizon.value.copy(this.baseHorizon).lerp(this.duskHorizon, u);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(this.skyUniforms.horizon.value);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(this.skyUniforms.horizon.value);
  }

  public update(cameraPos: THREE.Vector3, playerX: number, playerZ: number, time: number): void {
    this.sky.position.copy(cameraPos);
    this.sunSprite.position.set(cameraPos.x - 520, 150 - this.progress * 105, cameraPos.z - 480);
    this.sunSprite.lookAt(cameraPos);
    this.clouds.position.set(cameraPos.x, 0, cameraPos.z);
    this.clouds.rotation.y = time * 0.004;
    this.mountains.position.set(cameraPos.x, 0, cameraPos.z);
    if (Math.hypot(playerX - this.groundCentre.x, playerZ - this.groundCentre.y) > GROUND_RECENTRE) {
      this.groundCentre.set(playerX, playerZ);
      colorGround(this.ground, playerX, playerZ);
    }
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.group.parent?.remove(this.group);
    this.leaves.dispose();
    this.leaves2.dispose();
    this.trunks.dispose();
    this.boulders.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
