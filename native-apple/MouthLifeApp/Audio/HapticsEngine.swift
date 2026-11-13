import Foundation
import MouthLifeCore

#if canImport(CoreHaptics)
import CoreHaptics
#endif

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Native Apple `CoreHaptics` tactile enamel biophysics controller for iOS 17+ and macOS 14+.
///
/// Translates microscopic oral surface states (gritty plaque vs. wet mirror-smooth fluorapatite)
/// and HYDRA-1 actuator events into sculpted transient/continuous Taptic waveforms.
/// Gracefully becomes a zero-overhead no-op on Simulator, iPads without Taptic hardware, or Macs.
public final class HapticsEngine: @unchecked Sendable {
    public static let shared = HapticsEngine()

    private static let enabledDefaultsKey = "com.mouthlife.haptics.enabled"

    private let stateLock = NSLock()
    private let hapticQueue = DispatchQueue(label: "com.mouthlife.haptics.engine", qos: .userInteractive)

    private var _isEnabled: Bool
    private var lastEnamelRubTimestamp: TimeInterval = 0
    private var lastScrubTickTimestamp: TimeInterval = 0
    private var lastWarningTimestamp: TimeInterval = 0
    private var lastPacerQuadrantIdx: Int = -1
    private var lastPacerSurfaceIdx: Int = -1

    public let supportsHaptics: Bool

    #if canImport(CoreHaptics)
    private var engine: CHHapticEngine?
    private var engineNeedsStart: Bool = true
    private var engineNeedsRebuild: Bool = false
    #endif

    private var lifecycleObservers: [NSObjectProtocol] = []

    public var isEnabled: Bool {
        get {
            stateLock.lock()
            defer { stateLock.unlock() }
            return _isEnabled
        }
        set {
            stateLock.lock()
            let changed = (_isEnabled != newValue)
            _isEnabled = newValue
            stateLock.unlock()

            UserDefaults.standard.set(newValue, forKey: Self.enabledDefaultsKey)
            guard changed, supportsHaptics else { return }

            #if canImport(CoreHaptics)
            hapticQueue.async { [weak self] in
                guard let self else { return }
                self.engine?.isMutedForHaptics = !newValue
                if newValue {
                    self.prepareEngineOnQueue()
                }
            }
            #endif
        }
    }

    public init() {
        if UserDefaults.standard.object(forKey: Self.enabledDefaultsKey) != nil {
            self._isEnabled = UserDefaults.standard.bool(forKey: Self.enabledDefaultsKey)
        } else {
            self._isEnabled = true
        }

        #if canImport(CoreHaptics)
        let hardwareSupported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
        self.supportsHaptics = hardwareSupported
        if hardwareSupported {
            installLifecycleObservers()
            hapticQueue.async { [weak self] in
                self?.buildEngineOnQueue()
            }
        }
        #else
        self.supportsHaptics = false
        #endif
    }

    deinit {
        for token in lifecycleObservers {
            NotificationCenter.default.removeObserver(token)
        }
    }

    /// Pre-warms the Taptic Engine before interactive scenes (e.g. Companion Arch rub or Arcade drop).
    public func prepare() {
        guard supportsHaptics, isEnabled else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            self?.prepareEngineOnQueue()
        }
        #endif
    }

    // MARK: - Enamel Biophysics Tactile Surface Rub

    /// Tactile response when rubbing across the 14-crown Companion Arch or probing enamel surfaces.
    ///
    /// - Parameters:
    ///   - smoothnessIndex: Biophysical Smoothness Index (`0...100`).
    ///     - `< 50`: Chalky, gritty biofilm plaque (`sharpness ~ 0.85` + rapid micro-transient grit clicks).
    ///     - `50..<85`: Satin transitional polish (`sharpness 0.52 -> 0.24`).
    ///     - `>= 85` (Smooth Bask): Wet fluorapatite silk/glass (`sharpness 0.12`, warm continuous glide).
    ///   - intensity: Finger velocity / pressure scalar (`0.0...1.0`).
    public func playEnamelRub(smoothnessIndex: Double, intensity: Float = 1.0) {
        guard canPlayHaptics() else { return }
        let clampedIntensity = max(0.0, min(1.0, intensity))
        guard clampedIntensity > 0.03 else { return }

        let now = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        if now - lastEnamelRubTimestamp < 0.044 {
            stateLock.unlock()
            return
        }
        lastEnamelRubTimestamp = now
        stateLock.unlock()

        #if canImport(CoreHaptics)
        let clampedSmooth = Float(max(0.0, min(100.0, smoothnessIndex)))
        hapticQueue.async { [weak self] in
            guard let self else { return }
            var events: [CHHapticEvent] = []
            var curves: [CHHapticParameterCurve] = []

            if clampedSmooth < 50.0 {
                // Gritty / chalky plaque regime: high sharpness + micro-transient surface roughness
                let gritProgress = clampedSmooth / 50.0 // 0 = roughest, 1 = approaching satin
                let sharpness: Float = 0.85 + (1.0 - gritProgress) * 0.08 // 0.85..0.93
                let baseGain = min(1.0, (0.34 + 0.48 * clampedIntensity) * (1.05 - 0.15 * gritProgress))

                events.append(
                    CHHapticEvent(
                        eventType: .hapticContinuous,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: baseGain * 0.72),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
                            CHHapticEventParameter(parameterID: .attackTime, value: 0.02),
                            CHHapticEventParameter(parameterID: .releaseTime, value: 0.05)
                        ],
                        relativeTime: 0.0,
                        duration: 0.054
                    )
                )

                // Rapid chalky micro-clicks across the plaque biofilm matrix
                let clickOffsets: [(TimeInterval, Float, Float)] = [
                    (0.000, 1.00, min(1.0, sharpness + 0.05)),
                    (0.017, 0.72, sharpness),
                    (0.035, 0.84, min(1.0, sharpness + 0.03))
                ]
                for (offset, gainScale, clickSharp) in clickOffsets {
                    events.append(
                        CHHapticEvent(
                            eventType: .hapticTransient,
                            parameters: [
                                CHHapticEventParameter(parameterID: .hapticIntensity, value: min(1.0, baseGain * gainScale)),
                                CHHapticEventParameter(parameterID: .hapticSharpness, value: clickSharp)
                            ],
                            relativeTime: offset
                        )
                    )
                }
            } else if clampedSmooth < 85.0 {
                // Satin polishing transition (50..<85): grit dissolves into smooth enamel luster
                let t = (clampedSmooth - 50.0) / 35.0
                let sharpness: Float = 0.52 * (1.0 - t) + 0.22 * t
                let contGain = min(1.0, (0.24 + 0.38 * clampedIntensity))

                events.append(
                    CHHapticEvent(
                        eventType: .hapticContinuous,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: contGain),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
                            CHHapticEventParameter(parameterID: .attackTime, value: 0.12),
                            CHHapticEventParameter(parameterID: .releaseTime, value: 0.18)
                        ],
                        relativeTime: 0.0,
                        duration: 0.062
                    )
                )

                // Subtle single micro-luster tap that fades out as smoothness nears 85
                let tapGain = contGain * (1.0 - t * 0.65) * 0.55
                if tapGain > 0.06 {
                    events.append(
                        CHHapticEvent(
                            eventType: .hapticTransient,
                            parameters: [
                                CHHapticEventParameter(parameterID: .hapticIntensity, value: tapGain),
                                CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness + 0.08)
                            ],
                            relativeTime: 0.006
                        )
                    )
                }
            } else {
                // Smooth Bask (>= 85): gliding across wet fluorapatite mirror-glass / silk!
                let silkGain = min(0.72, 0.20 + 0.36 * clampedIntensity)
                events.append(
                    CHHapticEvent(
                        eventType: .hapticContinuous,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: silkGain),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.12),
                            CHHapticEventParameter(parameterID: .attackTime, value: 0.28),
                            CHHapticEventParameter(parameterID: .releaseTime, value: 0.38)
                        ],
                        relativeTime: 0.0,
                        duration: 0.076
                    )
                )

                curves.append(
                    CHHapticParameterCurve(
                        parameterID: .hapticIntensityControl,
                        controlPoints: [
                            CHHapticParameterCurve.ControlPoint(relativeTime: 0.000, value: 0.65),
                            CHHapticParameterCurve.ControlPoint(relativeTime: 0.032, value: 1.00),
                            CHHapticParameterCurve.ControlPoint(relativeTime: 0.076, value: 0.45)
                        ],
                        relativeTime: 0.0
                    )
                )
            }

            self.playEventsOnQueue(events: events, parameterCurves: curves)
        }
        #endif
    }

    /// Subtle continuous sonic bristle pulse while actively scrubbing plaque in Arcade / Pulp Rescue.
    public func playSonicScrubTick(cleanRatio: Double, speedNormalized: Float = 0.75) {
        guard canPlayHaptics() else { return }
        let clampedSpeed = max(0.0, min(1.0, speedNormalized))
        guard clampedSpeed > 0.08 else { return }

        let now = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        if now - lastScrubTickTimestamp < 0.065 {
            stateLock.unlock()
            return
        }
        lastScrubTickTimestamp = now
        stateLock.unlock()

        let mappedSmoothness = 25.0 + max(0.0, min(1.0, cleanRatio)) * 70.0
        playEnamelRub(smoothnessIndex: mappedSmoothness, intensity: clampedSpeed * 0.55)
    }

    // MARK: - HYDRA-1 Actuator & World Signatures

    /// Capillary Tether-Zip: fluid launch whoosh ramping into a crisp interdental anchor lock.
    public func playTetherZip() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.68),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.42),
                        CHHapticEventParameter(parameterID: .attackTime, value: 0.08),
                        CHHapticEventParameter(parameterID: .releaseTime, value: 0.05)
                    ],
                    relativeTime: 0.0,
                    duration: 0.14
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.92),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.86)
                    ],
                    relativeTime: 0.142
                )
            ]
            let curves: [CHHapticParameterCurve] = [
                CHHapticParameterCurve(
                    parameterID: .hapticIntensityControl,
                    controlPoints: [
                        .init(relativeTime: 0.00, value: 0.35),
                        .init(relativeTime: 0.13, value: 0.95),
                        .init(relativeTime: 0.16, value: 1.00)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticParameterCurve(
                    parameterID: .hapticSharpnessControl,
                    controlPoints: [
                        .init(relativeTime: 0.00, value: -0.20),
                        .init(relativeTime: 0.14, value: 0.35)
                    ],
                    relativeTime: 0.0
                )
            ]
            self.playEventsOnQueue(events: events, parameterCurves: curves)
        }
        #endif
    }

    /// Polymer Floss silk twang: razor-crisp taut string pluck with elastic harmonic recoil.
    public func playFlossSnap() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.90),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.95)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.48),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.68)
                    ],
                    relativeTime: 0.030
                ),
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.38),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.52),
                        CHHapticEventParameter(parameterID: .sustained, value: 0.0),
                        CHHapticEventParameter(parameterID: .decayTime, value: 0.25)
                    ],
                    relativeTime: 0.008,
                    duration: 0.075
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// Fluoride-Bicarb Ion Rinse: warm alkaline fluid swell topped with sparkling fluorapatite crystal pops.
    public func playFluorideSurge() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            var events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.66),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.20),
                        CHHapticEventParameter(parameterID: .attackTime, value: 0.22),
                        CHHapticEventParameter(parameterID: .releaseTime, value: 0.45)
                    ],
                    relativeTime: 0.0,
                    duration: 0.38
                )
            ]

            let sparkles: [(TimeInterval, Float, Float)] = [
                (0.035, 0.46, 0.56),
                (0.095, 0.58, 0.66),
                (0.165, 0.68, 0.76),
                (0.245, 0.56, 0.86),
                (0.330, 0.42, 0.94)
            ]
            for (time, gain, sharp) in sparkles {
                events.append(
                    CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: gain),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharp)
                        ],
                        relativeTime: time
                    )
                )
            }

            let curves: [CHHapticParameterCurve] = [
                CHHapticParameterCurve(
                    parameterID: .hapticIntensityControl,
                    controlPoints: [
                        .init(relativeTime: 0.00, value: 0.40),
                        .init(relativeTime: 0.14, value: 1.00),
                        .init(relativeTime: 0.38, value: 0.22)
                    ],
                    relativeTime: 0.0
                )
            ]
            self.playEventsOnQueue(events: events, parameterCurves: curves)
        }
        #endif
    }

    /// 24k Gold District Seal: authoritative double-lock stamp into warm resonant bell bloom.
    public func playDistrictSeal() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                // Initial warm stamp seat
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.82),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.30)
                    ],
                    relativeTime: 0.0
                ),
                // Crisp 24k gold lock click
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.00),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.78)
                    ],
                    relativeTime: 0.088
                ),
                // Shimmering confirmation chime accent
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.64),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.88)
                    ],
                    relativeTime: 0.195
                ),
                // Warm golden resonance tail
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.62),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.18),
                        CHHapticEventParameter(parameterID: .attackTime, value: 0.08),
                        CHHapticEventParameter(parameterID: .releaseTime, value: 0.55)
                    ],
                    relativeTime: 0.090,
                    duration: 0.32
                )
            ]
            let curves: [CHHapticParameterCurve] = [
                CHHapticParameterCurve(
                    parameterID: .hapticIntensityControl,
                    controlPoints: [
                        .init(relativeTime: 0.00, value: 1.00),
                        .init(relativeTime: 0.15, value: 0.90),
                        .init(relativeTime: 0.42, value: 0.15)
                    ],
                    relativeTime: 0.0
                )
            ]
            self.playEventsOnQueue(events: events, parameterCurves: curves)
        }
        #endif
    }

    /// Eyes-free 30-second Brush-Along Quadrant shift cue: unmistakable ascending triple pulse.
    public func playPacerQuadrantCue() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.68),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.45)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.82),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.65)
                    ],
                    relativeTime: 0.105
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.96),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.82)
                    ],
                    relativeTime: 0.220
                ),
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.45),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.25),
                        CHHapticEventParameter(parameterID: .attackTime, value: 0.05),
                        CHHapticEventParameter(parameterID: .releaseTime, value: 0.35)
                    ],
                    relativeTime: 0.225,
                    duration: 0.16
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// Subtle 10-second surface angle tick (buccal -> occlusal -> lingual) during Brush-Along mode.
    public func playPacerSurfaceTick() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.46),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.58)
                    ],
                    relativeTime: 0.0
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// Sucrose Crystal fracture: brittle high-sharpness crack dispersing into crystalline shards.
    public func playSucroseShatter() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.96),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.96)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.68),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.88)
                    ],
                    relativeTime: 0.028
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.52),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.84)
                    ],
                    relativeTime: 0.062
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.36),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.92)
                    ],
                    relativeTime: 0.105
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.24),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.86)
                    ],
                    relativeTime: 0.152
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// Gentle biophysical caution nudge (acid-softened enamel, gingival sulcus tenderness, or EPS deflection).
    public func playGentleWarning() {
        guard canPlayHaptics() else { return }

        let now = ProcessInfo.processInfo.systemUptime
        stateLock.lock()
        if now - lastWarningTimestamp < 0.35 {
            stateLock.unlock()
            return
        }
        lastWarningTimestamp = now
        stateLock.unlock()

        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.54),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.22)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.40),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.16)
                    ],
                    relativeTime: 0.115
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// Commensal Colony restored: uplifting 3-step rising micro-bloom.
    public func playCommensalRestored() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.50),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.42)
                    ],
                    relativeTime: 0.0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.68),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.60)
                    ],
                    relativeTime: 0.065
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.82),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.74)
                    ],
                    relativeTime: 0.135
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    /// S. mutans cocci pop: playful light bubble tap.
    public func playMutansPop() {
        guard canPlayHaptics() else { return }
        #if canImport(CoreHaptics)
        hapticQueue.async { [weak self] in
            guard let self else { return }
            let events: [CHHapticEvent] = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.58),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.72)
                    ],
                    relativeTime: 0.0
                )
            ]
            self.playEventsOnQueue(events: events)
        }
        #endif
    }

    // MARK: - Direct EventBus Integration

    /// Convenience dispatcher matching `MouthLifeCore.GameEvent` so `AppCoordinator` can bind haptics directly.
    public func handleGameEvent(_ event: GameEvent) {
        switch event {
        case let .actuatorScrub(cleanRatio, newlyCleaned, _, acidWarn):
            if acidWarn {
                playGentleWarning()
            } else if newlyCleaned > 0 {
                playSonicScrubTick(cleanRatio: cleanRatio, speedNormalized: 0.72)
            }

        case let .flossSliced(_, _, _, _, zipped, _):
            if zipped {
                playTetherZip()
            } else {
                playFlossSnap()
            }

        case .rinseSurged, .fluorapatiteInfused:
            playFluorideSurge()

        case .districtSealed, .pacerComplete:
            playDistrictSeal()

        case .siteRestored, .upgradeUnlocked:
            playCommensalRestored()

        case .sucroseShattered, .epsCracked:
            playSucroseShatter()

        case .mutansPopped, .beaconCollected, .springTriggered:
            playMutansPop()

        case .gumTender, .epsDeflected, .stephanSip, .erosionWash:
            playGentleWarning()

        case let .pacerTick(elapsedSec, quadrantIdx, surfaceIdx, _):
            stateLock.lock()
            if elapsedSec < 0.25 {
                lastPacerQuadrantIdx = quadrantIdx
                lastPacerSurfaceIdx = surfaceIdx
                stateLock.unlock()
                return
            }
            let prevQuad = lastPacerQuadrantIdx
            let prevSurf = lastPacerSurfaceIdx
            lastPacerQuadrantIdx = quadrantIdx
            lastPacerSurfaceIdx = surfaceIdx
            stateLock.unlock()

            if prevQuad >= 0 && quadrantIdx != prevQuad {
                playPacerQuadrantCue()
            } else if prevSurf >= 0 && surfaceIdx != prevSurf {
                playPacerSurfaceTick()
            }

        case let .modeChanged(_, to):
            if to == .brushAlong {
                stateLock.lock()
                lastPacerQuadrantIdx = -1
                lastPacerSurfaceIdx = -1
                stateLock.unlock()
            }
            if to == .hub || to == .arcade || to == .pulpRescue || to == .brushAlong {
                prepare()
            }

        default:
            break
        }
    }

    // MARK: - CoreHaptics Lifecycle & Recovery

    private func canPlayHaptics() -> Bool {
        guard supportsHaptics else { return false }
        stateLock.lock()
        let enabled = _isEnabled
        stateLock.unlock()
        return enabled
    }

    #if canImport(CoreHaptics)
    private func installLifecycleObservers() {
        let center = NotificationCenter.default
        #if canImport(UIKit)
        let fgToken = center.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.notifyForegroundResume()
        }
        let activeToken = center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.notifyForegroundResume()
        }
        lifecycleObservers.append(contentsOf: [fgToken, activeToken])
        #elseif canImport(AppKit)
        let activeToken = center.addObserver(
            forName: NSApplication.didBecomeActiveNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            self?.notifyForegroundResume()
        }
        lifecycleObservers.append(activeToken)
        #endif
    }

    private func notifyForegroundResume() {
        guard canPlayHaptics() else { return }
        hapticQueue.async { [weak self] in
            guard let self else { return }
            self.engineNeedsStart = true
            self.prepareEngineOnQueue()
        }
    }

    private func buildEngineOnQueue() {
        do {
            let newEngine = try CHHapticEngine()
            newEngine.playsHapticsOnly = true
            newEngine.isAutoShutdownEnabled = true
            newEngine.isMutedForHaptics = !isEnabled

            newEngine.stoppedHandler = { [weak self] reason in
                guard let self else { return }
                self.hapticQueue.async {
                    switch reason {
                    case .engineDestroyed, .systemError:
                        self.engineNeedsRebuild = true
                        self.engineNeedsStart = true
                    case .audioSessionInterrupt, .applicationSuspended, .idleTimeout, .notifyWhenFinished, .gameControllerDisconnect:
                        self.engineNeedsStart = true
                    @unknown default:
                        self.engineNeedsStart = true
                    }
                }
            }

            newEngine.resetHandler = { [weak self] in
                guard let self else { return }
                self.hapticQueue.async {
                    self.engineNeedsStart = true
                    if self.canPlayHaptics() {
                        try? self.engine?.start()
                        self.engineNeedsStart = false
                    }
                }
            }

            self.engine = newEngine
            self.engineNeedsRebuild = false
            self.engineNeedsStart = true
        } catch {
            self.engine = nil
            self.engineNeedsRebuild = true
        }
    }

    private func prepareEngineOnQueue() {
        if engine == nil || engineNeedsRebuild {
            buildEngineOnQueue()
        }
        guard let engine else { return }
        if engineNeedsStart {
            do {
                try engine.start()
                engineNeedsStart = false
            } catch {
                // If app is still transitioning from background, keep engineNeedsStart = true for next event.
                engineNeedsStart = true
            }
        }
    }

    private func playEventsOnQueue(
        events: [CHHapticEvent],
        parameterCurves: [CHHapticParameterCurve] = []
    ) {
        guard !events.isEmpty else { return }
        prepareEngineOnQueue()
        guard let engine, !engineNeedsStart else { return }

        do {
            let pattern = try CHHapticPattern(events: events, parameterCurves: parameterCurves)
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // Recover transparently if the server stopped mid-flight (e.g. idle shutdown race).
            engineNeedsStart = true
            do {
                try engine.start()
                engineNeedsStart = false
                let pattern = try CHHapticPattern(events: events, parameterCurves: parameterCurves)
                let player = try engine.makePlayer(with: pattern)
                try player.start(atTime: CHHapticTimeImmediate)
            } catch {
                engineNeedsStart = true
            }
        }
    }
    #endif
}
