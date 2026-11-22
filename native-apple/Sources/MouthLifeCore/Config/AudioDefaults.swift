import Foundation

/// Where the volume sliders start. Web twin: `DEFAULT_AUDIO_PREFS` and `migrateSfxVolume` in
/// `src/engine/audio/musicTheory.ts`.
public enum AudioDefaults {
    public static let musicVolume: Float = 0.70
    /// Sound effects start a quarter quieter than they did before November 2026 (0.85): the owner
    /// found them too loud beside the music.
    public static let sfxVolume: Float = 0.64
    /// The sound-effect default before it was lowered.
    public static let oldSfxVolume: Float = 0.85
    /// Saved with the preferences, so a level saved under an older default can be told from a chosen one.
    public static let version = 2

    /// A sound-effect level saved before the default was lowered, and still exactly the old default,
    /// was never chosen (the settings are saved together whenever any one changes): it moves to the
    /// new default. A level saved since, or any other level, is the player's own and is kept.
    public static func migratedSfxVolume(stored: Float, savedVersion: Int) -> Float {
        if savedVersion >= version { return stored }
        return abs(stored - oldSfxVolume) < 0.005 ? sfxVolume : stored
    }
}
