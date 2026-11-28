/**
 * Which finger drives the 3D scene, as plain data. Native twin: `ScenePointerOwner.swift` in
 * MouthLifeCore, with the same rule and the same test cases (`tests/pointerOwner.test.ts`,
 * `ScenePointerOwnerTests.swift`).
 *
 * One finger drives the scene. A second one neither takes over nor double-taps while the first is
 * really down, so lifting a second finger never lets go of a held scrub. "Really down" is asked
 * each time a new touch begins: the owner keeps the scene only if it is still among the touches on
 * the screen, and only if the screen has not let go of held input since it landed (`epoch`: a
 * pause, a finale, a new stage). Otherwise the new touch is the owner, so an owner whose "lifted"
 * never arrived cannot keep every later touch out.
 *
 * There is no time limit and no clock in the rule: a finger resting still on a tooth sends
 * nothing, and must keep scrubbing for as long as it rests there.
 */
export class ScenePointerOwner {
  private ownerKey: number | null = null;
  private ownerEpoch = 0;

  /** The owning finger's identity (its pointer id), or null when nobody owns the scene. */
  get key(): number | null {
    return this.ownerKey;
  }

  /**
   * True when the owner keeps a new touch out: it is another finger, it is still among the touches
   * on the screen (`liveKeys`), and the screen has not let go since it landed. A new touch with the
   * owner's own identity is a new touch. (Touch pointer ids do not come back within a page; the
   * rule matters for the app, where the system's identities do. Kept the same so the twins agree.)
   */
  holds(newKey: number, liveKeys: ReadonlySet<number>, epoch: number): boolean {
    if (this.ownerKey === null || this.ownerKey === newKey) return false;
    return this.ownerEpoch === epoch && liveKeys.has(this.ownerKey);
  }

  /** A touch began. True when it now owns the scene; false when the owner keeps it out. */
  began(newKey: number, liveKeys: ReadonlySet<number>, epoch: number): boolean {
    if (this.holds(newKey, liveKeys, epoch)) return false;
    this.take(newKey, epoch);
    return true;
  }

  /** Makes `newKey` the owner without asking (the mouse, which is never kept out). */
  take(newKey: number, epoch: number): void {
    this.ownerKey = newKey;
    this.ownerEpoch = epoch;
  }

  /** True when a move of `movedKey` drives the scene: it is the owner, on the screen it landed on. */
  drives(movedKey: number, epoch: number): boolean {
    return this.ownerKey === movedKey && this.ownerEpoch === epoch;
  }

  /** Touches lifted or were cancelled. True when the owner was among them and has let go. */
  ended(keys: Iterable<number>): boolean {
    if (this.ownerKey === null) return false;
    for (const key of keys) {
      if (key === this.ownerKey) {
        this.ownerKey = null;
        return true;
      }
    }
    return false;
  }

  /**
   * Drops the owner whatever it is doing: the page is hidden, the window lost focus, the stage is
   * paused. True when there was one. A finger that is still down no longer drives; the scene waits
   * for a new touch.
   */
  releaseAll(): boolean {
    if (this.ownerKey === null) return false;
    this.ownerKey = null;
    return true;
  }
}
