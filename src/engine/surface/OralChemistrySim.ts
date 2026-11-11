import {
  CELL_SIZE,
  NEUTRAL_SALIVA_PH,
  SALIVA_SPRING_PH_BOOST,
  STEPHAN_DROP_PH,
  STEPHAN_RECOVERY_SEC,
} from '../../config/gameConfig';

export class OralChemistrySim {
  readonly gridW: number;
  readonly gridH: number;
  readonly baselinePh: number;
  readonly spatialPh: Float32Array;
  readonly gumIrritation: Float32Array;

  private stephanTimerSec = 0;
  private chemistryDirty = true;

  constructor(worldWidth: number, worldDepth: number, baselinePh = NEUTRAL_SALIVA_PH) {
    this.gridW = Math.round(worldWidth / CELL_SIZE);
    this.gridH = Math.round(worldDepth / CELL_SIZE);
    this.baselinePh = baselinePh;
    const count = this.gridW * this.gridH;
    this.spatialPh = new Float32Array(count);
    this.spatialPh.fill(baselinePh);
    this.gumIrritation = new Float32Array(count);
  }

  reset(): void {
    this.spatialPh.fill(this.baselinePh);
    this.gumIrritation.fill(0);
    this.stephanTimerSec = 0;
    this.chemistryDirty = true;
  }

  /**
   * Triggers or resets the 1940 Stephan Curve 20-second sucrose acid drop window.
   */
  triggerSucroseStephanHit(): void {
    this.stephanTimerSec = STEPHAN_RECOVERY_SEC;
    this.chemistryDirty = true;
  }

  getStephanTimerSec(): number {
    return this.stephanTimerSec;
  }

  getStephanGlobalPhOffset(): number {
    if (this.stephanTimerSec <= 0) return 0;
    const ratio = this.stephanTimerSec / STEPHAN_RECOVERY_SEC;
    return (STEPHAN_DROP_PH - this.baselinePh) * ratio;
  }

  getCellPh(idx: number): number {
    if (idx < 0 || idx >= this.spatialPh.length) return this.baselinePh;
    const raw = this.spatialPh[idx] + this.getStephanGlobalPhOffset();
    return Math.max(4.0, Math.min(7.6, raw));
  }

  getAveragePh(): number {
    let sum = 0;
    const len = this.spatialPh.length;
    if (len === 0) return this.baselinePh;
    const offset = this.getStephanGlobalPhOffset();
    for (let i = 0; i < len; i++) {
      sum += Math.max(4.0, Math.min(7.6, this.spatialPh[i] + offset));
    }
    return sum / len;
  }

  applyAcidZone(cx: number, cz: number, radius: number, targetPh: number): void {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    for (let gz = minGz; gz <= maxGz; gz++) {
      const worldZ = (gz + 0.5) * CELL_SIZE;
      const dz = worldZ - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const worldX = (gx + 0.5) * CELL_SIZE;
        const dx = worldX - cx;
        const dSq = dx * dx + dz * dz;
        if (dSq <= rSq) {
          const idx = gz * this.gridW + gx;
          if (targetPh < this.spatialPh[idx]) {
            this.spatialPh[idx] = Math.max(4.0, targetPh);
            this.chemistryDirty = true;
          }
        }
      }
    }
  }

  triggerSalivaSpring(
    cx: number,
    cz: number,
    radius: number,
    targetPh = SALIVA_SPRING_PH_BOOST
  ): void {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    for (let gz = minGz; gz <= maxGz; gz++) {
      const worldZ = (gz + 0.5) * CELL_SIZE;
      const dz = worldZ - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const worldX = (gx + 0.5) * CELL_SIZE;
        const dx = worldX - cx;
        if (dx * dx + dz * dz <= rSq) {
          const idx = gz * this.gridW + gx;
          if (this.spatialPh[idx] < targetPh) {
            this.spatialPh[idx] = Math.min(7.5, targetPh);
            this.chemistryDirty = true;
          }
        }
      }
    }
  }

  addGumIrritation(cx: number, cz: number, radius: number, amount: number): void {
    const minGx = Math.max(0, Math.floor((cx - radius) / CELL_SIZE));
    const maxGx = Math.min(this.gridW - 1, Math.ceil((cx + radius) / CELL_SIZE));
    const minGz = Math.max(0, Math.floor((cz - radius) / CELL_SIZE));
    const maxGz = Math.min(this.gridH - 1, Math.ceil((cz + radius) / CELL_SIZE));
    const rSq = radius * radius;

    for (let gz = minGz; gz <= maxGz; gz++) {
      const worldZ = (gz + 0.5) * CELL_SIZE;
      const dz = worldZ - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const worldX = (gx + 0.5) * CELL_SIZE;
        const dx = worldX - cx;
        if (dx * dx + dz * dz <= rSq) {
          const idx = gz * this.gridW + gx;
          this.gumIrritation[idx] = Math.max(0, Math.min(1, this.gumIrritation[idx] + amount));
          this.chemistryDirty = true;
        }
      }
    }
  }

  /** Adds gum irritation to a single grid cell (used by heavy-handed sulcus scrubbing). */
  addGumIrritationCell(idx: number, amount: number): void {
    if (idx < 0 || idx >= this.gumIrritation.length || amount === 0) return;
    this.gumIrritation[idx] = Math.max(0, Math.min(1, this.gumIrritation[idx] + amount));
    this.chemistryDirty = true;
  }

  getGumIrritationCell(idx: number): number {
    if (idx < 0 || idx >= this.gumIrritation.length) return 0;
    return this.gumIrritation[idx];
  }

  getMaxGumIrritation(): number {
    let max = 0;
    for (let i = 0; i < this.gumIrritation.length; i++) {
      if (this.gumIrritation[i] > max) max = this.gumIrritation[i];
    }
    return max;
  }

  /**
   * Salivary bicarbonate buffering: shortens the remaining Stephan Curve recovery window.
   * Returns the remaining acid-clock seconds.
   */
  bufferStephan(seconds: number): number {
    if (this.stephanTimerSec > 0 && seconds > 0) {
      this.stephanTimerSec = Math.max(0, this.stephanTimerSec - seconds);
      this.chemistryDirty = true;
    }
    return this.stephanTimerSec;
  }

  step(dt: number): void {
    if (this.stephanTimerSec > 0) {
      this.stephanTimerSec = Math.max(0, this.stephanTimerSec - dt);
      this.chemistryDirty = true;
    }

    const phRecoveryStep = 0.08 * dt;
    const gumCoolStep = 0.12 * dt;
    const len = this.spatialPh.length;

    for (let i = 0; i < len; i++) {
      const ph = this.spatialPh[i];
      if (Math.abs(ph - this.baselinePh) > 0.001) {
        if (ph < this.baselinePh) {
          this.spatialPh[i] = Math.min(this.baselinePh, ph + phRecoveryStep);
        } else {
          this.spatialPh[i] = Math.max(this.baselinePh, ph - phRecoveryStep * 0.5);
        }
        this.chemistryDirty = true;
      }
      const gum = this.gumIrritation[i];
      if (gum > 0) {
        this.gumIrritation[i] = Math.max(0, gum - gumCoolStep);
        this.chemistryDirty = true;
      }
    }
  }

  consumeDirtyFlag(): boolean {
    const wasDirty = this.chemistryDirty;
    this.chemistryDirty = false;
    return wasDirty;
  }
}
