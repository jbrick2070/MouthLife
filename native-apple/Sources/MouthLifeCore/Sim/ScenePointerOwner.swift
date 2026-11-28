import Foundation

/// Which finger drives the 3D scene, as plain data. Web twin: `ScenePointerOwner` in
/// `src/engine/pointerOwner.ts`, with the same rule and the same test cases
/// (`ScenePointerOwnerTests.swift`, `tests/pointerOwner.test.ts`).
///
/// One finger drives the scene. A second one neither takes over nor double-taps while the first is
/// really down, so lifting a second finger never lets go of a held scrub. "Really down" is asked
/// each time a new touch begins: the owner keeps the scene only if it is still among the touches on
/// the screen, and only if the screen has not let go of held input since it landed (`epoch`: a
/// pause, a finale, a new stage). Otherwise the new touch is the owner.
///
/// The view used to keep the system's touch object and read its phase, which Apple says not to
/// do; an owner whose "lifted" never arrived would have kept every later touch out. Here only the
/// finger's identity is kept: a number that stays the same for as long as it is down.
///
/// There is no time limit and no clock in the rule: a finger resting still on a tooth sends
/// nothing, and must keep scrubbing for as long as it rests there.
public struct ScenePointerOwner: Equatable, Sendable {
    /// The owning finger's identity, or nil when nobody owns the scene.
    public private(set) var key: Int?
    /// The input epoch when the owner landed.
    public private(set) var epoch: Int = 0

    public init() {}

    /// True when the owner keeps a new touch out: it is another finger, it is still among the
    /// touches on the screen (`liveKeys`), and the screen has not let go since it landed. A new
    /// touch with the owner's own identity is a new touch: the system uses a touch's identity again
    /// once that finger has lifted.
    public func holds(against newKey: Int, liveKeys: Set<Int>, epoch: Int) -> Bool {
        guard let key, key != newKey else { return false }
        return self.epoch == epoch && liveKeys.contains(key)
    }

    /// A touch began. True when it now owns the scene (the caller tells the scene "finger down");
    /// false when the owner keeps it out.
    public mutating func began(_ newKey: Int, liveKeys: Set<Int>, epoch: Int) -> Bool {
        if holds(against: newKey, liveKeys: liveKeys, epoch: epoch) { return false }
        take(newKey, epoch: epoch)
        return true
    }

    /// Makes `newKey` the owner without asking (the browser's mouse, which is never kept out).
    public mutating func take(_ newKey: Int, epoch: Int) {
        key = newKey
        self.epoch = epoch
    }

    /// True when a move of `movedKey` drives the scene: it is the owner, on the screen it landed on.
    public func drives(_ movedKey: Int, epoch: Int) -> Bool {
        key == movedKey && self.epoch == epoch
    }

    /// Touches lifted or were cancelled. True when the owner was among them and has let go (the
    /// caller tells the scene "finger up").
    public mutating func ended(_ keys: Set<Int>) -> Bool {
        guard let key, keys.contains(key) else { return false }
        self.key = nil
        return true
    }

    /// Drops the owner whatever it is doing: the app is no longer active, the view has left the
    /// screen or something covers it. True when there was one. A finger that is still down no
    /// longer drives; the scene waits for a new touch.
    @discardableResult
    public mutating func releaseAll() -> Bool {
        guard key != nil else { return false }
        key = nil
        return true
    }
}
