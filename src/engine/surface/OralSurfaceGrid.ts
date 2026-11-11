import {
  BASS_UPGRADE_MARGIN_BOOST,
  CELL_SIZE,
  CLEAN_THRESHOLD,
  CRITICAL_PH_FLUORAPATITE,
  CRITICAL_PH_HYDROXYAPATITE,
  EPS_CRACKED_SLURRY_CAP,
  EPS_FLOSS_CRACK_HALF_WIDTH,
  EPS_RINSE_BIOFILM_CHIP,
  GUM_TENDER_THRESHOLD,
  SULCUS_MOVING_IRRITATION_MULT,
  FLUORIDE_SEAL_RESOIL_MULT,
  MARGIN_BASE_PENALTY,
  RINSE_SLURRY_THRESHOLD,
  RINSE_THICK_BIOFILM_CHIP,
} from '../../config/gameConfig';
import { buildAlleyWalls } from '../physics/CollisionSystem';
import {
  type BChannelMode,
  type BrushApplyParams,
  CellFlag,
  type ToolApplyResult,
  type WorldCartridge,
} from '../types';
import type { OralChemistrySim } from './OralChemistrySim';

function wrapAngleRad(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function distancePointToSegmentSq2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-8) {
    return wx * wx + wz * wz;
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  const projX = ax + t * vx;
  const projZ = az + t * vz;
  const dx = px - projX;
  const dz = pz - projZ;
  return dx * dx + dz * dz;
}

export class OralSurfaceGrid {
  readonly worldWidth: number;
  readonly worldDepth: number;
  readonly gridW: number;
  readonly gridH: number;
  readonly cellCount: number;

  readonly density: Float32Array;
  readonly flags: Uint8Array;
  readonly districtIdxMap: Int8Array; // -1 = none, 0..N-1 = district index
  readonly rgbaBuffer: Uint8Array;

  private totalPaintableAll = 0;
  private cleanPaintableAll = 0;
  private totalPaintableByDistrict: number[] = [];
  private cleanPaintableByDistrict: number[] = [];
  private initialEpsCells = 0;
  private activeEpsCells = 0;
  private fluorideSealedCells = 0;
  textureDirty = true;

  constructor(worldWidth: number, worldDepth: number) {
    this.worldWidth = worldWidth;
    this.worldDepth = worldDepth;
    this.gridW = Math.round(worldWidth / CELL_SIZE);
    this.gridH = Math.round(worldDepth / CELL_SIZE);
    this.cellCount = this.gridW * this.gridH;

    this.density = new Float32Array(this.cellCount);
    this.flags = new Uint8Array(this.cellCount);
    this.districtIdxMap = new Int8Array(this.cellCount);
    this.districtIdxMap.fill(-1);
    this.rgbaBuffer = new Uint8Array(this.cellCount * 4);
  }

  bakeFromCartridge(cartridge: WorldCartridge): void {
    this.density.fill(0);
    this.flags.fill(CellFlag.NONE);
    this.districtIdxMap.fill(-1);

    const districtCount = cartridge.districts.length;
    const alleyWallBoxes = buildAlleyWalls(cartridge);
    this.totalPaintableAll = 0;
    this.cleanPaintableAll = 0;
    this.totalPaintableByDistrict = new Array(districtCount).fill(0);
    this.cleanPaintableByDistrict = new Array(districtCount).fill(0);
    this.initialEpsCells = 0;
    this.activeEpsCells = 0;
    this.fluorideSealedCells = 0;

    for (let gz = 0; gz < this.gridH; gz++) {
      const wz = (gz + 0.5) * CELL_SIZE;
      for (let gx = 0; gx < this.gridW; gx++) {
        const wx = (gx + 0.5) * CELL_SIZE;
        const idx = gz * this.gridW + gx;

        const inPlayable = cartridge.playableMaskBoxes.some(
          (b) => wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ
        );
        if (!inPlayable) continue;

        const inSolidWall =
          cartridge.wallBoxes.some(
            (w) => wx >= w.minX && wx <= w.maxX && wz >= w.minZ && wz <= w.maxZ
          ) ||
          alleyWallBoxes.some(
            (w) => wx >= w.minX && wx <= w.maxX && wz >= w.minZ && wz <= w.maxZ
          );
        if (inSolidWall) continue;

        let f = CellFlag.PAINTABLE;
        let d = cartridge.basePellicleDensity;

        // Margin / fissure higher-density bands
        for (const band of cartridge.marginBands) {
          const distSq = distancePointToSegmentSq2D(
            wx,
            wz,
            band.a.x,
            band.a.z,
            band.b.x,
            band.b.z
          );
          if (distSq <= band.radius * band.radius) {
            f |= CellFlag.MARGIN_FISSURE;
            d = Math.max(d, band.initialDensity);
          }
        }

        // Gingival sulcus margins (World 2): tender tissue that punishes heavy stationary scrubbing
        if (cartridge.sulcusBands) {
          for (const band of cartridge.sulcusBands) {
            const distSq = distancePointToSegmentSq2D(
              wx,
              wz,
              band.a.x,
              band.a.z,
              band.b.x,
              band.b.z
            );
            if (distSq <= band.radius * band.radius) {
              f |= CellFlag.SULCUS;
              d = Math.max(d, band.initialDensity);
            }
          }
        }

        // Single-source Interdental Alley stamping from cartridge.interdentalAlleys[]
        for (const alley of cartridge.interdentalAlleys) {
          const halfW = alley.width * 0.5;
          const distSq = distancePointToSegmentSq2D(
            wx,
            wz,
            alley.endpointA.x,
            alley.endpointA.z,
            alley.endpointB.x,
            alley.endpointB.z
          );
          if (distSq <= halfW * halfW) {
            f |= CellFlag.INTERDENTAL;
            d = Math.max(d, 0.78);
          }
        }

        // Zero-G quorum-sensing EPS biofilm domes (World 5): deflect Sonic Brush until cracked
        if (cartridge.epsDomes && (f & CellFlag.INTERDENTAL) === 0) {
          for (const dome of cartridge.epsDomes) {
            const dx = wx - dome.cx;
            const dz = wz - dome.cz;
            if (dx * dx + dz * dz <= dome.radius * dome.radius) {
              f |= CellFlag.EPS_ARMOR;
              d = Math.max(d, dome.initialDensity);
            }
          }
        }

        if ((f & CellFlag.EPS_ARMOR) !== 0) {
          this.initialEpsCells++;
          this.activeEpsCells++;
        }

        this.flags[idx] = f;
        this.density[idx] = Math.max(0, Math.min(1, d));

        // Assign district index
        let assignedDistrict = -1;
        for (let di = 0; di < districtCount; di++) {
          const bounds = cartridge.districts[di].bounds;
          if (
            wx >= bounds.minX &&
            wx <= bounds.maxX &&
            wz >= bounds.minZ &&
            wz <= bounds.maxZ
          ) {
            assignedDistrict = di;
            break;
          }
        }
        this.districtIdxMap[idx] = assignedDistrict;

        this.totalPaintableAll++;
        const isClean = this.density[idx] <= CLEAN_THRESHOLD;
        if (isClean) this.cleanPaintableAll++;

        if (assignedDistrict >= 0) {
          this.totalPaintableByDistrict[assignedDistrict]++;
          if (isClean) this.cleanPaintableByDistrict[assignedDistrict]++;
        }
      }
    }

    this.textureDirty = true;
  }

  private setCellDensity(idx: number, nextRaw: number): boolean {
    const f = this.flags[idx];
    if ((f & CellFlag.PAINTABLE) === 0) return false;

    const prev = this.density[idx];
    const next = Math.max(0, Math.min(1, nextRaw));
    if (Math.abs(next - prev) < 1e-6) return false;

    const wasClean = prev <= CLEAN_THRESHOLD;
    const nowClean = next <= CLEAN_THRESHOLD;
    this.density[idx] = next;
    this.textureDirty = true;

    if (!wasClean && nowClean) {
      this.cleanPaintableAll++;
      const di = this.districtIdxMap[idx];
      if (di >= 0) this.cleanPaintableByDistrict[di]++;
      return true;
    } else if (wasClean && !nowClean) {
      this.cleanPaintableAll = Math.max(0, this.cleanPaintableAll - 1);
      const di = this.districtIdxMap[idx];
      if (di >= 0) {
        this.cleanPaintableByDistrict[di] = Math.max(
          0,
          this.cleanPaintableByDistrict[di] - 1
        );
      }
    }
    return false;
  }

  private sealCellFluorapatite(idx: number): boolean {
    const f = this.flags[idx];
    if ((f & CellFlag.PAINTABLE) === 0 || (f & CellFlag.FLUORIDE_SEALED) !== 0) return false;
    this.flags[idx] = f | CellFlag.FLUORIDE_SEALED;
    this.fluorideSealedCells++;
    this.textureDirty = true;
    return true;
  }

  private crackCellEpsArmor(idx: number): boolean {
    const f = this.flags[idx];
    if ((f & CellFlag.EPS_ARMOR) === 0) return false;
    this.flags[idx] = f & ~CellFlag.EPS_ARMOR;
    this.activeEpsCells = Math.max(0, this.activeEpsCells - 1);
    this.textureDirty = true;
    return true;
  }

  applyBrush(params: BrushApplyParams, chemistry: OralChemistrySim): ToolApplyResult {
    const minGx = Math.max(0, Math.floor((params.cx - params.radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((params.cx + params.radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((params.cz - params.radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((params.cz + params.radius) / CELL_SIZE));
    const rSq = params.radius * params.radius;
    const halfArc = params.arcRad * 0.5;
    const closeCoreSq = 0.42 * 0.42;

    let newlyCleanedCells = 0;
    let densityRemovedTotal = 0;
    let acidAbrasionWarnings = 0;
    let gumTenderWarnings = 0;
    let epsDeflectWarnings = 0;
    let fluorapatiteConverted = 0;
    const sulcusRate = params.sulcusIrritationPerSec ?? 0;
    const sulcusMotionMult = params.isMovingSweep ? SULCUS_MOVING_IRRITATION_MULT : 1.0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      const dz = wz - params.cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const dx = wx - params.cx;
        const dSq = dx * dx + dz * dz;
        if (dSq > rSq) continue;

        if (dSq > closeCoreSq) {
          const cellAngle = Math.atan2(dz, dx);
          if (Math.abs(wrapAngleRad(cellAngle - params.facingRad)) > halfArc) {
            continue;
          }
        }

        const idx = gz * this.gridW + gx;
        let f = this.flags[idx];
        if ((f & CellFlag.PAINTABLE) === 0) continue;
        if ((f & CellFlag.INTERDENTAL) !== 0) continue;
        if ((f & CellFlag.EPS_ARMOR) !== 0) {
          epsDeflectWarnings++;
          continue;
        }

        // World 4 Miswak + F⁻ lattice infusion converts brushed enamel into Fluorapatite (pH 4.5 stable!)
        if (params.convertToFluorapatite && (f & CellFlag.FLUORIDE_SEALED) === 0) {
          if (this.sealCellFluorapatite(idx)) {
            fluorapatiteConverted++;
            f = this.flags[idx];
          }
        }

        const prev = this.density[idx];
        if (prev <= 0) continue;

        // Real Enamel Chemistry Check: 4.5 for Fluorapatite vs 5.5 for Hydroxyapatite
        const criticalPh =
          (f & CellFlag.FLUORIDE_SEALED) !== 0
            ? CRITICAL_PH_FLUORAPATITE
            : CRITICAL_PH_HYDROXYAPATITE;
        const cellPh = chemistry.getCellPh(idx);
        if (cellPh < criticalPh) {
          acidAbrasionWarnings++;
          continue;
        }

        // 1948 Bass Sulcus Care: tender inflamed gingiva refuses heavy-handed scrubbing
        if (sulcusRate > 0 && (f & CellFlag.SULCUS) !== 0) {
          if (chemistry.getGumIrritationCell(idx) >= GUM_TENDER_THRESHOLD) {
            gumTenderWarnings++;
            continue;
          }
          chemistry.addGumIrritationCell(idx, sulcusRate * sulcusMotionMult * params.dt);
        }

        const isMargin = (f & CellFlag.MARGIN_FISSURE) !== 0;
        const marginMult = isMargin
          ? params.hasBassUpgrade
            ? MARGIN_BASE_PENALTY * BASS_UPGRADE_MARGIN_BOOST
            : MARGIN_BASE_PENALTY
          : 1.0;

        const falloff = 1.0 - 0.22 * (dSq / Math.max(0.01, rSq));
        const delta = params.removalPerSec * marginMult * falloff * params.dt;
        const next = Math.max(0, prev - delta);
        densityRemovedTotal += prev - next;

        if (this.setCellDensity(idx, next)) {
          newlyCleanedCells++;
        }
      }
    }

    return {
      newlyCleanedCells,
      densityRemovedTotal,
      acidAbrasionWarnings,
      gumTenderWarnings,
      epsDeflectWarnings,
      fluorapatiteConverted,
    };
  }

  /** Converts paintable non-EPS cells inside world circle (cx, cz, radius) into Fluorapatite. */
  convertCircleToFluorapatite(cx: number, cz: number, radius: number): number {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;
    let converted = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      const dz = wz - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const dx = wx - cx;
        if (dx * dx + dz * dz > rSq) continue;
        const idx = gz * this.gridW + gx;
        const f = this.flags[idx];
        if ((f & CellFlag.PAINTABLE) === 0 || (f & CellFlag.EPS_ARMOR) !== 0) continue;
        if (this.sealCellFluorapatite(idx)) converted++;
      }
    }
    return converted;
  }

  /** True when the cell at world (x, z) is a gingival sulcus margin cell. */
  isSulcusAt(x: number, z: number): boolean {
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    if (gx < 0 || gz < 0 || gx >= this.gridW || gz >= this.gridH) return false;
    return (this.flags[gz * this.gridW + gx] & CellFlag.SULCUS) !== 0;
  }

  /** True when the cell at world (x, z) is shielded by intact EPS biofilm armor. */
  isEpsArmoredAt(x: number, z: number): boolean {
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    if (gx < 0 || gz < 0 || gx >= this.gridW || gz >= this.gridH) return false;
    return (this.flags[gz * this.gridW + gx] & CellFlag.EPS_ARMOR) !== 0;
  }

  /** True when the cell at world (x, z) has been converted into acid-defying Fluorapatite. */
  isFluorideSealedAt(x: number, z: number): boolean {
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    if (gx < 0 || gz < 0 || gx >= this.gridW || gz >= this.gridH) return false;
    return (this.flags[gz * this.gridW + gx] & CellFlag.FLUORIDE_SEALED) !== 0;
  }

  getEpsArmorCount(): number {
    return this.activeEpsCells;
  }

  getInitialEpsArmorCount(): number {
    return this.initialEpsCells;
  }

  getEpsArmorRemainingRatio(): number {
    if (this.initialEpsCells === 0) return 0;
    return this.activeEpsCells / this.initialEpsCells;
  }

  getFluorapatiteRatio(): number {
    if (this.totalPaintableAll === 0) return 0;
    return this.fluorideSealedCells / this.totalPaintableAll;
  }

  applyFlossSegment(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    halfWidth: number,
    epsCrackHalfWidth = EPS_FLOSS_CRACK_HALF_WIDTH
  ): ToolApplyResult {
    const outerHw = this.activeEpsCells > 0 ? Math.max(halfWidth, epsCrackHalfWidth) : halfWidth;
    const minX = Math.min(x0, x1) - outerHw;
    const maxX = Math.max(x0, x1) + outerHw;
    const minZ = Math.min(z0, z1) - outerHw;
    const maxZ = Math.max(z0, z1) + outerHw;

    const minGx = Math.max(0, Math.floor(minX / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil(maxX / CELL_SIZE));
    const minGz = Math.max(0, Math.floor(minZ / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil(maxZ / CELL_SIZE));
    const hwSq = halfWidth * halfWidth;
    const outerHwSq = outerHw * outerHw;

    let newlyCleanedCells = 0;
    let densityRemovedTotal = 0;
    let epsCellsCracked = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const distSq = distancePointToSegmentSq2D(wx, wz, x0, z0, x1, z1);
        if (distSq > outerHwSq) continue;

        const idx = gz * this.gridW + gx;
        const f = this.flags[idx];
        if ((f & CellFlag.PAINTABLE) === 0) continue;

        const cracked = this.crackCellEpsArmor(idx);
        if (cracked) epsCellsCracked++;

        const prev = this.density[idx];
        if (distSq <= hwSq) {
          if (prev <= 0) continue;
          densityRemovedTotal += prev;
          if (this.setCellDensity(idx, 0)) {
            newlyCleanedCells++;
          }
        } else if (cracked && prev > EPS_CRACKED_SLURRY_CAP) {
          // Quorum-fracture shockwave turns flanking dome armor into scrubbable slurry
          densityRemovedTotal += prev - EPS_CRACKED_SLURRY_CAP;
          if (this.setCellDensity(idx, EPS_CRACKED_SLURRY_CAP)) {
            newlyCleanedCells++;
          }
        }
      }
    }

    return { newlyCleanedCells, densityRemovedTotal, acidAbrasionWarnings: 0, epsCellsCracked };
  }

  applyIonRinse(
    cx: number,
    cz: number,
    radius: number,
    chemistry: OralChemistrySim,
    hasBicarbUpgrade = false
  ): ToolApplyResult {
    chemistry.triggerSalivaSpring(cx, cz, radius, hasBicarbUpgrade ? 7.2 : 7.05);

    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    let newlyCleanedCells = 0;
    let densityRemovedTotal = 0;
    let cellsSealed = 0;
    let epsCellsCracked = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      const dz = wz - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const dx = wx - cx;
        if (dx * dx + dz * dz > rSq) continue;

        const idx = gz * this.gridW + gx;
        const f = this.flags[idx];
        if ((f & CellFlag.PAINTABLE) === 0) continue;

        const wasArmored = this.crackCellEpsArmor(idx);
        if (wasArmored) epsCellsCracked++;

        const prev = this.density[idx];
        if (prev <= RINSE_SLURRY_THRESHOLD) {
          // Mechanically disrupted slurry flushes away completely & forms Fluorapatite seal!
          if (prev > 0) {
            densityRemovedTotal += prev;
            if (this.setCellDensity(idx, 0)) {
              newlyCleanedCells++;
            }
          }
          if (this.sealCellFluorapatite(idx)) {
            cellsSealed++;
          }
        } else {
          // Intact dense biofilm (> 0.35) sheds liquid rinse, though Surge cracks EPS armor
          const chip = wasArmored ? EPS_RINSE_BIOFILM_CHIP : RINSE_THICK_BIOFILM_CHIP;
          const next = Math.max(0, prev - chip);
          densityRemovedTotal += prev - next;
          if (this.setCellDensity(idx, next)) {
            newlyCleanedCells++;
          }
        }
      }
    }

    return {
      newlyCleanedCells,
      densityRemovedTotal,
      acidAbrasionWarnings: 0,
      cellsSealed,
      epsCellsCracked,
    };
  }

  sealDistrict(districtIndex: number): number {
    let newlySealed = 0;
    for (let idx = 0; idx < this.cellCount; idx++) {
      if (this.districtIdxMap[idx] !== districtIndex) continue;
      if ((this.flags[idx] & CellFlag.PAINTABLE) === 0) continue;
      this.crackCellEpsArmor(idx);
      this.setCellDensity(idx, 0);
      if (this.sealCellFluorapatite(idx)) {
        newlySealed++;
      }
    }
    this.textureDirty = true;
    return newlySealed;
  }

  depositPlaqueCircle(
    cx: number,
    cz: number,
    radius: number,
    ratePerSec: number,
    dt: number
  ): void {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      const dz = wz - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const dx = wx - cx;
        if (dx * dx + dz * dz > rSq) continue;

        const idx = gz * this.gridW + gx;
        const f = this.flags[idx];
        if ((f & CellFlag.PAINTABLE) === 0) continue;

        const mult = (f & CellFlag.FLUORIDE_SEALED) !== 0 ? FLUORIDE_SEAL_RESOIL_MULT : 1.0;
        const next = Math.min(0.95, this.density[idx] + ratePerSec * mult * dt);
        this.setCellDensity(idx, next);
      }
    }
  }

  getWorldCleanRatio(): number {
    if (this.totalPaintableAll === 0) return 1;
    return this.cleanPaintableAll / this.totalPaintableAll;
  }

  getDistrictCleanRatio(districtIndex: number): number {
    const total = this.totalPaintableByDistrict[districtIndex] ?? 0;
    if (total === 0) return 1;
    return (this.cleanPaintableByDistrict[districtIndex] ?? 0) / total;
  }

  getAreaCleanRatio(cx: number, cz: number, radius: number): number {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    let total = 0;
    let clean = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      if (gz < 0 || gz >= this.gridH) continue;
      const wz = (gz + 0.5) * CELL_SIZE;
      const dz = wz - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (gx < 0 || gx >= this.gridW) continue;
        const wx = (gx + 0.5) * CELL_SIZE;
        const dx = wx - cx;
        if (dx * dx + dz * dz > rSq) continue;

        const idx = gz * this.gridW + gx;
        if ((this.flags[idx] & CellFlag.PAINTABLE) === 0) continue;
        total++;
        if (this.density[idx] <= CLEAN_THRESHOLD) clean++;
      }
    }

    return total === 0 ? 1 : clean / total;
  }

  syncRgbaBuffer(chemistry: OralChemistrySim, bChannelMode: BChannelMode): boolean {
    const chemDirty = chemistry.consumeDirtyFlag();
    if (!this.textureDirty && !chemDirty) {
      return false;
    }

    for (let idx = 0; idx < this.cellCount; idx++) {
      const base = idx * 4;
      const f = this.flags[idx];
      const paintable = (f & CellFlag.PAINTABLE) !== 0;

      this.rgbaBuffer[base] = Math.round(this.density[idx] * 255);
      this.rgbaBuffer[base + 1] = (f & CellFlag.FLUORIDE_SEALED) !== 0 ? 255 : 0;

      let bVal = 0;
      if (bChannelMode === 'marginDensity') {
        bVal = (f & CellFlag.MARGIN_FISSURE) !== 0 ? 220 : 0;
      } else if (bChannelMode === 'gumIrritation') {
        // Faint baseline glow marks the sulcus margin; inflammation flushes it coral-red
        const sulcusBase = (f & CellFlag.SULCUS) !== 0 ? 0.16 : 0;
        bVal = Math.round(Math.max(sulcusBase, chemistry.gumIrritation[idx]) * 255);
      } else if (bChannelMode === 'localPh') {
        const ph = chemistry.getCellPh(idx);
        const acidNorm = Math.max(0, Math.min(1, (6.5 - ph) / 2.2));
        bVal = Math.round(acidNorm * 255);
      } else if (bChannelMode === 'epsArmor') {
        bVal = (f & CellFlag.EPS_ARMOR) !== 0 ? 255 : 0;
      }
      this.rgbaBuffer[base + 2] = bVal;
      this.rgbaBuffer[base + 3] = paintable ? 255 : 0;
    }

    this.textureDirty = false;
    return true;
  }
}
