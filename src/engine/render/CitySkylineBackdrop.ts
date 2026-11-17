/**
 * Draws a stage's city skyline (see config/citySkylineGeometry.ts): one flat-coloured mesh for the
 * buildings, plus one mesh of lights per district whose brightness follows how clean that district
 * is. The city wakes up as the player cleans it.
 */
import * as THREE from 'three';
import { cityArtForHost } from '../../config/citySkylines';
import {
  SKYLINE_ART_WIDTH,
  skylineDistrictIndex,
  skylineLightLevel,
  skylinePoint,
  skylinePropAnchors,
  skylinePropPoint,
  type SkylinePiece,
} from '../../config/citySkylineGeometry';
import type { WorldCartridge } from '../types';

interface Bucket {
  positions: number[];
  colors: number[];
}

/** What the backdrop needs from the running session each frame. */
export interface SkylineProgressSource {
  sealedDistricts: readonly boolean[];
  grid: { getDistrictCleanRatio(districtIndex: number): number };
}

const tmpColor = new THREE.Color();

function addPiece(
  bucket: Bucket,
  piece: SkylinePiece,
  toWorld: (x: number, y: number, order: number) => [number, number, number]
): void {
  tmpColor.setHex(piece.color);
  for (let i = 0; i < piece.tris.length; i += 2) {
    const p = toWorld(piece.tris[i], piece.tris[i + 1], piece.order);
    bucket.positions.push(p[0], p[1], p[2]);
    bucket.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
  }
}

export class CitySkylineBackdrop {
  readonly group = new THREE.Group();
  private readonly lightMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly levels: number[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(cartridge: WorldCartridge) {
    this.group.name = 'CitySkyline';
    const art = cityArtForHost(cartridge.hostId);
    if (!art) return;

    const districts = cartridge.districts;
    const base: Bucket = { positions: [], colors: [] };
    const lights: Bucket[] = districts.map(() => ({ positions: [], colors: [] }));
    const offsetX = (cartridge.worldWidth - SKYLINE_ART_WIDTH) * 0.5;

    const panorama = (x: number, y: number, order: number) => skylinePoint(x, y, order, cartridge.worldWidth);
    for (const piece of art.skyline) {
      const bucket = piece.light ? lights[skylineDistrictIndex(districts, piece.cx + offsetX)] : base;
      addPiece(bucket, piece, panorama);
    }
    for (const anchor of skylinePropAnchors(cartridge.worldWidth, cartridge.worldDepth)) {
      const district = skylineDistrictIndex(districts, anchor.x);
      const stand = (x: number, y: number, order: number) => skylinePropPoint(x, y, order, anchor.x, anchor.z);
      for (const piece of art.prop) addPiece(piece.light ? lights[district] : base, piece, stand);
    }

    this.addMesh(base, new THREE.Color(1, 1, 1));
    for (const bucket of lights) {
      const level = skylineLightLevel(0, false);
      this.levels.push(level);
      this.lightMaterials.push(this.addMesh(bucket, new THREE.Color(level, level, level)));
    }
  }

  private addMesh(bucket: Bucket, tint: THREE.Color): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: tint,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    this.disposables.push(material);
    if (bucket.positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
      this.disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    return material;
  }

  /** Eases each district's lights toward its clean level, with a slow twinkle. */
  update(frameDt: number, nowSec: number, progress: SkylineProgressSource, reducedMotion: boolean): void {
    const ease = 1 - Math.exp(-frameDt * 2.6);
    for (let i = 0; i < this.lightMaterials.length; i++) {
      const target = skylineLightLevel(progress.grid.getDistrictCleanRatio(i), progress.sealedDistricts[i] === true);
      this.levels[i] += (target - this.levels[i]) * ease;
      const twinkle = reducedMotion ? 1 : 1 + 0.05 * Math.sin(nowSec * 1.9 + i * 2.1);
      this.lightMaterials[i].color.setScalar(Math.min(1, this.levels[i] * twinkle));
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
