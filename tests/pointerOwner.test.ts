import { describe, expect, it } from 'vitest';
import { ScenePointerOwner } from '../src/engine/pointerOwner';

// Which finger drives the 3D scene. The native app's twin is
// native-apple/Tests/MouthLifeCoreTests/ScenePointerOwnerTests.swift: the same cases in the same
// order, one for one. Change both.

const live = (...keys: number[]): ReadonlySet<number> => new Set(keys);

describe('which finger owns the scene', () => {
  it('nobody owns the scene at first', () => {
    const owner = new ScenePointerOwner();
    expect(owner.key).toBeNull();
    expect(owner.drives(1, 0)).toBe(false);
    expect(owner.ended([1])).toBe(false);
    expect(owner.releaseAll()).toBe(false);
  });

  it('a finger lands, drives and lifts', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.key).toBe(1);
    expect(owner.drives(1, 0)).toBe(true);
    expect(owner.ended([1])).toBe(true);
    expect(owner.key).toBeNull();
    expect(owner.drives(1, 0)).toBe(false);
  });

  it('a second finger neither takes over nor lets go of the first', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.began(2, live(1, 2), 0)).toBe(false);
    expect(owner.key).toBe(1);
    expect(owner.drives(2, 0)).toBe(false);
    expect(owner.drives(1, 0)).toBe(true);
    // the second finger lifts: the first still scrubs
    expect(owner.ended([2])).toBe(false);
    expect(owner.key).toBe(1);
    expect(owner.drives(1, 0)).toBe(true);
    expect(owner.ended([1])).toBe(true);
  });

  it('a finger left down after the owner lifts does not take over by itself', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.began(2, live(1, 2), 0)).toBe(false);
    expect(owner.ended([1])).toBe(true);
    expect(owner.drives(2, 0)).toBe(false);
    // a new touch does, though the second finger is still on the screen
    expect(owner.began(3, live(2, 3), 0)).toBe(true);
    expect(owner.key).toBe(3);
  });

  it('a resting finger keeps the scene however long it rests', () => {
    // No clock anywhere in the rule: nothing arrives from a finger that rests still, and
    // however much later a second one lands, the first is still the owner.
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.began(2, live(1, 2), 0)).toBe(false);
    expect(owner.began(3, live(1, 3), 0)).toBe(false);
    expect(owner.drives(1, 0)).toBe(true);
  });

  it('an owner that vanished without lifting does not keep the next touch out', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    // no "lifted" and no "cancelled" ever arrives; the next touch is alone on the screen
    expect(owner.began(2, live(2), 0)).toBe(true);
    expect(owner.key).toBe(2);
    expect(owner.drives(2, 0)).toBe(true);
    expect(owner.drives(1, 0)).toBe(false);
    // a "lifted" for the old one, arriving late, does not let go of the new owner
    expect(owner.ended([1])).toBe(false);
    expect(owner.key).toBe(2);
  });

  it("the owner's identity beginning again is a new touch", () => {
    // The system hands identities out again: the same one beginning means the old finger went.
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.key).toBe(1);
    expect(owner.drives(1, 0)).toBe(true);
  });

  it('after the screen lets go the old finger no longer drives and a new one may land', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    // a pause, a finale or a new stage: the epoch moves on while the finger is still down
    expect(owner.drives(1, 1)).toBe(false);
    expect(owner.began(2, live(1, 2), 1)).toBe(true);
    expect(owner.key).toBe(2);
    expect(owner.drives(2, 1)).toBe(true);
    expect(owner.drives(1, 1)).toBe(false);
    // the old finger lifting does not let go of the new owner
    expect(owner.ended([1])).toBe(false);
    expect(owner.key).toBe(2);
  });

  it('a cancelled touch lets go like a lifted one', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.began(2, live(1, 2), 0)).toBe(false);
    // the system takes every finger away at once (a system gesture, a call)
    expect(owner.ended([1, 2])).toBe(true);
    expect(owner.key).toBeNull();
    expect(owner.began(3, live(3), 0)).toBe(true);
    expect(owner.key).toBe(3);
  });

  it('release-all drops the owner though its finger is still down', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    expect(owner.releaseAll()).toBe(true);
    expect(owner.key).toBeNull();
    expect(owner.drives(1, 0)).toBe(false);
    expect(owner.releaseAll()).toBe(false);
    // the finger that was let go of is still on the screen: it keeps nobody out
    expect(owner.began(2, live(1, 2), 0)).toBe(true);
    expect(owner.key).toBe(2);
    expect(owner.ended([1])).toBe(false);
    expect(owner.key).toBe(2);
  });

  it('take makes an owner without asking', () => {
    const owner = new ScenePointerOwner();
    expect(owner.began(1, live(1), 0)).toBe(true);
    owner.take(9, 0);
    expect(owner.key).toBe(9);
    expect(owner.holds(2, live(9, 2), 0)).toBe(true);
    expect(owner.holds(2, live(2), 0)).toBe(false);
    expect(owner.holds(9, live(9), 0)).toBe(false);
  });
});
