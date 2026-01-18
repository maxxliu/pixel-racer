import * as THREE from 'three';
import { createCircuit, Waypoint } from '../shared/game/TrackData';

export class RoadBuilder {
  private scene: THREE.Scene;
  private roadMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public buildTrackRoad(): void {
    const track = createCircuit();
    this.buildRoadFromWaypoints(track.waypoints);
    this.addTrackMarkings(track.waypoints);
  }

  private buildRoadFromWaypoints(waypoints: Waypoint[]): void {
    const roadWidth = 15;
    const roadSegments: THREE.Vector3[] = [];

    // Create smooth road path using Catmull-Rom spline
    const points = waypoints.map((wp) => new THREE.Vector3(wp.x, 0.1, wp.z));
    points.push(points[0].clone()); // Close the loop

    const curve = new THREE.CatmullRomCurve3(points, true);
    const curvePoints = curve.getPoints(waypoints.length * 10);

    // Build road geometry
    const roadGeometry = this.createRoadGeometry(curvePoints, roadWidth);

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.9,
      metalness: 0.1,
    });

    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    this.roadMeshes.push(roadMesh);

    // Add road edges/curbs
    this.addRoadEdges(curvePoints, roadWidth);
  }

  private createRoadGeometry(points: THREE.Vector3[], width: number): THREE.BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    const halfWidth = width / 2;

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const prev = points[(i - 1 + points.length) % points.length];

      // Calculate direction
      const direction = new THREE.Vector3().subVectors(next, prev).normalize();

      // Calculate perpendicular (right vector)
      const right = new THREE.Vector3(-direction.z, 0, direction.x);

      // Left and right edge points
      const left = current.clone().add(right.clone().multiplyScalar(-halfWidth));
      const rightPt = current.clone().add(right.clone().multiplyScalar(halfWidth));

      vertices.push(left.x, left.y, left.z);
      vertices.push(rightPt.x, rightPt.y, rightPt.z);

      // UVs for potential texturing
      const u = i / (points.length - 1);
      uvs.push(0, u);
      uvs.push(1, u);
    }

    // Create triangles
    for (let i = 0; i < points.length - 1; i++) {
      const base = i * 2;
      // Two triangles per quad
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  private addRoadEdges(points: THREE.Vector3[], roadWidth: number): void {
    const edgeWidth = 0.5;
    const edgeHeight = 0.15;
    const halfRoadWidth = roadWidth / 2;

    // Create edge geometry (simplified - just boxes along the path)
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      roughness: 0.8,
    });

    for (let i = 0; i < points.length; i += 5) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      const direction = new THREE.Vector3().subVectors(next, current).normalize();
      const right = new THREE.Vector3(-direction.z, 0, direction.x);

      // Left edge
      const leftEdgeGeom = new THREE.BoxGeometry(edgeWidth, edgeHeight, 2);
      const leftEdge = new THREE.Mesh(leftEdgeGeom, edgeMaterial);
      leftEdge.position.copy(current).add(right.clone().multiplyScalar(-halfRoadWidth - edgeWidth / 2));
      leftEdge.position.y = edgeHeight / 2;
      leftEdge.lookAt(next.clone().add(right.clone().multiplyScalar(-halfRoadWidth - edgeWidth / 2)));
      this.scene.add(leftEdge);
      this.roadMeshes.push(leftEdge);

      // Right edge (white)
      const rightEdgeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
      });
      const rightEdgeGeom = new THREE.BoxGeometry(edgeWidth, edgeHeight, 2);
      const rightEdge = new THREE.Mesh(rightEdgeGeom, rightEdgeMaterial);
      rightEdge.position.copy(current).add(right.clone().multiplyScalar(halfRoadWidth + edgeWidth / 2));
      rightEdge.position.y = edgeHeight / 2;
      rightEdge.lookAt(next.clone().add(right.clone().multiplyScalar(halfRoadWidth + edgeWidth / 2)));
      this.scene.add(rightEdge);
      this.roadMeshes.push(rightEdge);
    }
  }

  private addTrackMarkings(waypoints: Waypoint[]): void {
    // Add start/finish line
    const startWp = waypoints[0];
    const nextWp = waypoints[1];

    const direction = new THREE.Vector3(nextWp.x - startWp.x, 0, nextWp.z - startWp.z).normalize();
    const right = new THREE.Vector3(-direction.z, 0, direction.x);

    // Start/finish line
    const lineGeometry = new THREE.PlaneGeometry(15, 2);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const startLine = new THREE.Mesh(lineGeometry, lineMaterial);
    startLine.position.set(startWp.x, 0.1, startWp.z);
    startLine.rotation.x = -Math.PI / 2;
    startLine.rotation.z = Math.atan2(direction.x, direction.z);
    this.scene.add(startLine);
    this.roadMeshes.push(startLine);

    // Checkpoint markers
    waypoints.forEach((wp, index) => {
      if (wp.isCheckpoint && index > 0) {
        const checkpointGeom = new THREE.PlaneGeometry(15, 1);
        const checkpointMat = new THREE.MeshBasicMaterial({
          color: 0xffff00,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
        const checkpoint = new THREE.Mesh(checkpointGeom, checkpointMat);
        checkpoint.position.set(wp.x, 0.1, wp.z);
        checkpoint.rotation.x = -Math.PI / 2;
        this.scene.add(checkpoint);
        this.roadMeshes.push(checkpoint);
      }
    });
  }

  public dispose(): void {
    this.roadMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.roadMeshes = [];
  }
}
