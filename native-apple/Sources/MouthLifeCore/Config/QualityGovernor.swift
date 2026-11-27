import Foundation

/// Automatic graphics quality, chosen from what the system says about the device right now: how
/// warm it is, and whether Low Power Mode is on.
///
/// The app asks only at launch and when the screen changes (Home, a brush, a city), never in the
/// middle of play: changing the anti-aliasing or the sun's shadow map rebuilds render targets,
/// which would show as a hitch. Frame rate is left out on purpose. A display that settles at a
/// lower refresh rate on a calm screen looks the same as a slow device, and the frame-rate reading
/// only arrives when it changes.
///
/// Nothing is saved: the preference stays `.auto`, so Sync Codes are unchanged.
public enum QualityGovernor {
    /// The system's thermal state (`ProcessInfo.ThermalState`), named here so the rule can be
    /// tested without the device.
    public enum Heat: Int, Sendable, CaseIterable {
        case nominal
        case fair
        case serious
        case critical
    }

    /// - A device that is already hot (`serious`, `critical`) gets the lightest picture, so it can cool.
    /// - A warm one (`fair`) gets the middle one, before it gets hot.
    /// - Low Power Mode asks for less work: the middle one at most.
    public static func tier(heat: Heat, lowPowerMode: Bool) -> QualityTier {
        switch heat {
        case .serious, .critical:
            return .low
        case .fair:
            return .medium
        case .nominal:
            return lowPowerMode ? .medium : .ultra
        }
    }
}
