/**
 * Draws a stage's city skyline (see config/citySkylineGeometry.ts): one flat-coloured mesh for the
 * buildings, a sky per district that brightens smoothly, and that district's windows, signs and
 * lamps in a few steps that switch on one after another as it gets clean. The city wakes up as the
 * player cleans it. Groups the drawing marks as moving (a streetcar, clock hands, a blinking beacon)
 * get their own small meshes so they can slide, turn or flash.
 */
import * as THREE from 'three';
import { cityArtForHost } from '../../config/citySkylines';
import {
  SKYLINE_ART_WIDTH,
  SKYLINE_LIGHT_STEPS,
  SKYLINE_PLACE,
  skylineDistrictIndex,
  skylineLightLevel,
  skylineLightStep,
  skylineMotionPivot,
  skylineMotionState,
  skylinePieceSpanY,
  skylinePoint,
  skylinePropAnchors,
  skylinePropPoint,
  skylinePropStep,
  skylineStepLevel,
  type SkylineMotion,
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

/** One dial: a material whose brightness eases toward a target. */
interface LightDial {
  material: THREE.MeshBasicMaterial;
  district: number;
  /** -1 for a district's smooth dial (sky, moving lights); else the step it switches on at. */
  step: number;
  level: number;
}

interface MovingGroup {
  motion: SkylineMotion;
  node: THREE.Group;
  /** Where the node rests, in world space (its pivot, or the origin). */
  rest: THREE.Vector3;
  district: number;
  /** A blinking group's own light material; null when its lights follow the district's. */
  ownLight: THREE.MeshBasicMaterial | null;
}

type ToWorld = (x: number, y: number, order: number) => [number, number, number];

const footColor = new THREE.Color();
const topColor = new THREE.Color();
/** The panorama leans back, so "turning" a group means turning about this, the plane's normal. */
const PLANE_NORMAL = new THREE.Vector3(0, Math.sin(SKYLINE_PLACE.tiltRad), Math.cos(SKYLINE_PLACE.tiltRad));

function emptyBucket(): Bucket {
  return { positions: [], colors: [] };
}

function addPiece(bucket: Bucket, piece: SkylinePiece, toWorld: ToWorld, origin: THREE.Vector3 | null): void {
  footColor.setHex(piece.color);
  const shaded = piece.topColor !== null;
  let minY = 0;
  let spanY = 1;
  if (shaded) {
    topColor.setHex(piece.topColor as number);
    const span = skylinePieceSpanY(piece);
    minY = span.minY;
    spanY = Math.max(1e-6, span.maxY - span.minY);
  }
  for (let i = 0; i < piece.tris.length; i += 2) {
    const p = toWorld(piece.tris[i], piece.tris[i + 1], piece.order);
    bucket.positions.push(p[0] - (origin?.x ?? 0), p[1] - (origin?.y ?? 0), p[2] - (origin?.z ?? 0));
    if (shaded) {
      const t = (piece.tris[i + 1] - minY) / spanY;
      bucket.colors.push(
        footColor.r + (topColor.r - footColor.r) * t,
        footColor.g + (topColor.g - footColor.g) * t,
        footColor.b + (topColor.b - footColor.b) * t
      );
    } else {
      bucket.colors.push(footColor.r, footColor.g, footColor.b);
    }
  }
}

export class CitySkylineBackdrop {
  readonly group = new THREE.Group();
  private readonly dials: LightDial[] = [];
  /** Each district's smooth dial, by district index. */
  private readonly smooth: LightDial[] = [];
  private readonly moving: MovingGroup[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(cartridge: WorldCartridge) {
    this.group.name = 'CitySkyline';
    const art = cityArtForHost(cartridge.hostId);
    if (!art) return;

    const districts = cartridge.districts;
    const offsetX = (cartridge.worldWidth - SKYLINE_ART_WIDTH) * 0.5;
    const districtOf = (drawingX: number) => skylineDistrictIndex(districts, drawingX + offsetX);
    const panorama: ToWorld = (x, y, order) => skylinePoint(x, y, order, cartridge.worldWidth);

    const base = emptyBucket();
    const skies: Bucket[] = districts.map(() => emptyBucket());
    const stepped: Bucket[][] = districts.map(() => Array.from({ length: SKYLINE_LIGHT_STEPS }, emptyBucket));
    const groupBase = art.motions.map(() => emptyBucket());
    const groupLights = art.motions.map(() => emptyBucket());

    // Each moving group is built round its resting point, so turning or sliding it is one transform.
    const rests = art.motions.map((motion, i) => {
      const pivot = skylineMotionPivot(motion);
      if (!pivot) return new THREE.Vector3();
      const first = art.skyline.find((p) => p.group === i + 1);
      return new THREE.Vector3(...skylinePoint(pivot.x, pivot.y, first?.order ?? 0, cartridge.worldWidth));
    });

    art.skyline.forEach((piece, index) => {
      if (piece.group > 0) {
        const g = piece.group - 1;
        addPiece(piece.light ? groupLights[g] : groupBase[g], piece, panorama, rests[g]);
      } else if (!piece.light) {
        addPiece(base, piece, panorama, null);
      } else if (piece.topColor !== null) {
        addPiece(skies[districtOf(piece.cx)], piece, panorama, null);
      } else {
        addPiece(stepped[districtOf(piece.cx)][skylineLightStep(index)], piece, panorama, null);
      }
    });
    skylinePropAnchors(cartridge.worldWidth, cartridge.worldDepth).forEach((anchor, anchorIndex) => {
      const district = skylineDistrictIndex(districts, anchor.x);
      const step = skylinePropStep(anchorIndex);
      const stand: ToWorld = (x, y, order) =>
        skylinePropPoint(anchor.mirrored ? -x : x, y, order, anchor.x, anchor.z);
      for (const piece of art.prop) addPiece(piece.light ? stepped[district][step] : base, piece, stand, null);
    });

    const plain = this.makeMaterial(1);
    this.addMesh(base, plain, this.group);
    districts.forEach((_d, district) => {
      const dial = this.makeDial(district, -1);
      this.smooth.push(dial);
      this.addMesh(skies[district], dial.material, this.group);
      for (let step = 0; step < SKYLINE_LIGHT_STEPS; step++) {
        if (stepped[district][step].positions.length === 0) continue;
        this.addMesh(stepped[district][step], this.makeDial(district, step).material, this.group);
      }
    });

    art.motions.forEach((motion, i) => {
      const members = art.skyline.filter((p) => p.group === i + 1);
      if (members.length === 0) return;
      const district = districtOf(members.reduce((sum, p) => sum + p.cx, 0) / members.length);
      const node = new THREE.Group();
      node.position.copy(rests[i]);
      this.addMesh(groupBase[i], plain, node);
      const ownLight = motion.kind === 'blink' ? this.makeMaterial(this.smooth[district]?.level ?? 1) : null;
      this.addMesh(groupLights[i], ownLight ?? this.smooth[district].material, node);
      this.group.add(node);
      this.moving.push({ motion, node, rest: rests[i], district, ownLight });
    });
  }

  private makeDial(district: number, step: number): LightDial {
    const level = step < 0 ? skylineLightLevel(0, false) : skylineStepLevel(0, false, step);
    const dial: LightDial = { material: this.makeMaterial(level), district, step, level };
    this.dials.push(dial);
    return dial;
  }

  private makeMaterial(level: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      color: new THREE.Color(level, level, level),
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    this.disposables.push(material);
    return material;
  }

  private addMesh(bucket: Bucket, material: THREE.Material, parent: THREE.Object3D): void {
    if (bucket.positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
    this.disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    parent.add(mesh);
  }

  /** Eases every dial toward where its district's progress puts it, and moves the groups that move. */
  update(frameDt: number, nowSec: number, progress: SkylineProgressSource, reducedMotion: boolean): void {
    // Skies glide; windows snap on quickly enough to be noticed.
    const glide = 1 - Math.exp(-frameDt * 2.6);
    const snap = 1 - Math.exp(-frameDt * 7);
    for (const dial of this.dials) {
      const ratio = progress.grid.getDistrictCleanRatio(dial.district);
      const sealed = progress.sealedDistricts[dial.district] === true;
      const target = dial.step < 0 ? skylineLightLevel(ratio, sealed) : skylineStepLevel(ratio, sealed, dial.step);
      dial.level += (target - dial.level) * (dial.step < 0 ? glide : snap);
      const twinkle = reducedMotion ? 1 : 1 + 0.05 * Math.sin(nowSec * 1.9 + dial.district * 2.1 + dial.step * 1.3);
      dial.material.color.setScalar(Math.min(1, dial.level * twinkle));
    }
    for (const m of this.moving) {
      const state = skylineMotionState(m.motion, reducedMotion ? null : nowSec);
      m.node.position.set(m.rest.x + state.dx, m.rest.y, m.rest.z);
      m.node.quaternion.setFromAxisAngle(PLANE_NORMAL, state.angleRad);
      m.ownLight?.color.setScalar(Math.min(1, (this.smooth[m.district]?.level ?? 1) * state.glow));
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
