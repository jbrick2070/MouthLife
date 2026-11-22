import type { WorldCartridge } from '../types';

/**
 * A wall this narrow (along x) can be the contact between two teeth. A wider one is a sideways
 * wall or a block inside a tooth, and must not pinch the gumline. Swift twin: `ToothSeams.swift`.
 */
export const TOOTH_SEAM_MAX_WALL_WIDTH = 3.5;
/** A contact between two teeth runs out to the gum: its wall comes this close to the tooth's edge. */
export const TOOTH_SEAM_GUM_REACH = 1.0;

/**
 * Where one tooth meets the next along x: every zone boundary, and the middle of every narrow
 * divider wall that reaches the gum. The stage mesh necks the crown in and raises a gum point at
 * each. A wall standing free inside a tooth (a spur, the wall of an inner room) is not a seam.
 */
export function computeToothSeamsX(
  cartridge: Pick<WorldCartridge, 'districts' | 'wallBoxes' | 'playableMaskBoxes'>
): number[] {
  const seams = new Set<number>();
  for (let i = 1; i < cartridge.districts.length; i++) {
    seams.add(Math.round(cartridge.districts[i].bounds.minX * 10) / 10);
  }
  let edgeMinZ = Infinity;
  let edgeMaxZ = -Infinity;
  for (const b of cartridge.playableMaskBoxes) {
    edgeMinZ = Math.min(edgeMinZ, b.minZ);
    edgeMaxZ = Math.max(edgeMaxZ, b.maxZ);
  }
  for (const w of cartridge.wallBoxes) {
    if (w.maxX - w.minX > TOOTH_SEAM_MAX_WALL_WIDTH) continue;
    const reachesGum = w.minZ <= edgeMinZ + TOOTH_SEAM_GUM_REACH || w.maxZ >= edgeMaxZ - TOOTH_SEAM_GUM_REACH;
    if (!reachesGum) continue;
    seams.add(Math.round((w.minX + w.maxX) * 0.5 * 10) / 10);
  }
  return [...seams].sort((a, b) => a - b);
}
