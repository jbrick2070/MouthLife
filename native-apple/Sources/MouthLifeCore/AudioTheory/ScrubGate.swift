import Foundation

/// The brushing sound belongs to a stage that is being played: never over a finale, a score screen,
/// a pause or the main menu. The coordinator and the sound engine both ask this, so a late snapshot
/// arriving after a city ends cannot start the brush again. Web twin: `scrubMayPlay` in
/// `src/engine/audio/scrubGate.ts`.
public enum ScrubGate {
    public static func mayPlay(mode: AppMode, finale: Bool, paused: Bool, stageLive: Bool) -> Bool {
        (mode == .arcade || mode == .pulpRescue) && stageLive && !finale && !paused
    }
}
