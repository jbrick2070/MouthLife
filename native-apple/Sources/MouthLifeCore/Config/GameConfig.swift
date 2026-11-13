import Foundation

public enum GameConfig {
    // Spatial & Surface Grid Constants
    public static let cellSize: Double = 0.25
    public static let cleanThreshold: Float = 0.10
    public static let rinseSlurryThreshold: Float = 0.35
    public static let probeRadius: Double = 0.65
    public static let probeMoveSpeed: Double = 9.2
    public static let probeSweepSpeedThreshold: Double = 1.5

    // Biophysical Chemistry Constants
    public static let neutralSalivaPh: Float = 7.0
    public static let criticalPhHydroxyapatite: Float = 5.5
    public static let criticalPhFluorapatite: Float = 4.5
    public static let stephanDropPh: Float = 4.8
    public static let stephanRecoverySec: Double = 20.0
    public static let salivaSpringRadius: Double = 5.0
    public static let salivaSpringPhBoost: Float = 7.15
    public static let stephanSpringBufferSec: Double = 7.0
    public static let stephanDefaultSipIntervalSec: Double = 24.0

    // 1819 Parmly / 1948 Bass Gingival Sulcus Care (World 2)
    public static let sulcusStationaryIrritationPerSec: Double = 0.95
    public static let sulcusMovingIrritationMult: Double = 0.12
    public static let sulcusBassIrritationMult: Double = 0.65
    public static let sulcusHydrosonicIrritationMult: Double = 0.50
    public static let gumTenderThreshold: Float = 0.72
    public static let salivaSpringGumSoothe: Float = 0.60

    // Ancient Miswak & 1901–1945 Fluorapatite Conversion (World 4)
    public static let hibiscusErosionPh: Float = 4.95
    public static let hibiscusDefaultPulseSec: Double = 14.0
    public static let miswakInfusionDurationSec: Double = 9.0
    public static let miswakSpringConvertRadius: Double = 4.6

    // 1973 Skylab & 1978 Costerton Quorum-Sensing EPS Biofilm Domes (World 5)
    public static let epsFlossCrackHalfWidth: Double = 2.25
    public static let epsCrackedSlurryCap: Float = 0.52
    public static let epsRinseBiofilmChip: Float = 0.28
    public static let surgePerEpsCellCracked: Double = 0.08

    // Sonic Bristle Actuator
    public static let brushBaseRadius: Double = 1.75
    public static let brushHydrosonicRadiusMult: Double = 1.16
    public static let brushOverdriveRadiusMult: Double = 1.25
    public static let brushBaseArcRad: Double = (95.0 * .pi) / 180.0
    public static let brushHydrosonicArcRad: Double = (115.0 * .pi) / 180.0
    public static let brushBassArcRad: Double = (130.0 * .pi) / 180.0
    public static let brushMovingRate: Double = 2.65
    public static let brushStationaryRate: Double = 0.85
    public static let marginBasePenalty: Double = 0.65
    public static let hydrosonicMarginBoost: Double = 1.30
    public static let bassUpgradeMarginBoost: Double = 1.45
    public static let fluorideSealResoilMult: Double = 0.40

    // Polymer Floss Actuator & Capillary Tether-Zip
    public static let flossLength: Double = 4.0
    public static let flossBaseHalfWidth: Double = 0.16
    public static let flossPtfeHalfWidth: Double = 0.24
    public static let flossCooldownSec: Double = 0.32
    public static let flossZipEntryDist: Double = 1.65
    public static let flossZipMaxAngleRad: Double = (24.0 * .pi) / 180.0
    public static let flossZipDurationSec: Double = 0.22
    public static let flossZipAssistAngleRad: Double = (62.0 * .pi) / 180.0
    public static let flossZipAssistEntryDist: Double = 2.2
    public static let zipPromptRadius: Double = 2.9

    // Fluoride-Bicarb Ion Rinse & Disclosing Scan
    public static let rinseWaveRadius: Double = 9.2
    public static let rinseWaveDurationSec: Double = 1.0
    public static let rinseThickBiofilmChip: Float = 0.04
    public static let discloseWaveRadius: Double = 19.0
    public static let discloseDurationSec: Double = 3.8
    public static let discloseCooldownSec: Double = 5.5

    // Surge Meter Economy (0..100)
    public static let surgeMax: Double = 100.0
    public static let surgePerCleanedCell: Double = 0.12
    public static let surgePerFlossTarget: Double = 15.0
    public static let ptfeSurgeMultiplier: Double = 1.25
    public static let surgePerSiteRestored: Double = 30.0
    public static let surgePerBeacon: Double = 50.0

    // District & Site Thresholds
    public static let siteRestoreRadius: Double = 2.0
    public static let siteRestoreCleanRatio: Double = 0.85
    public static let districtSealCleanRatio: Double = 0.90
    public static let pulpRescueDurationSec: Double = 90.0
    public static let pulpRescueWinCleanRatio: Double = 0.85

    // Ecology & Mutans Constants
    public static let sucroseSpawnIntervalSec: Double = 5.5
    public static let maxMutansPerCrystal: Int = 3
    public static let maxMutansGlobal: Int = 12
    public static let mutansMoveSpeed: Double = 2.8
    public static let mutansTrailRadius: Double = 0.75
    public static let mutansDepositRate: Double = 0.11
    public static let mutansStunSec: Double = 3.0
    public static let acidPoolRadius: Double = 1.25
    public static let acidPoolLifetimeSec: Double = 6.0
    public static let acidPoolSlowMult: Double = 0.70
    public static let probeKnockbackSec: Double = 0.25

    // Companion Smooth Bask & Saliva Stasis Constants
    public static let smoothBaskThreshold: Double = 85.0
    public static let stasisFloorSmoothness: Double = 45.0
    public static let offlineBaskSlopePerHr: Double = 1.25
    public static let offlineSettleSlopePerHr: Double = 6.67
    public static let idleIonsPerBaskHr: Double = 6.0
    public static let idleIonReservoirCap: Int = 72
    public static let treatSmoothnessDrop: Double = 35.0
    public static let treatAcidThresholdSmoothness: Double = 50.0
    public static let treatAcidLoadPoints: Double = 45.0
    public static let treatIonReward: Int = 20
    public static let treatMaxRewardedPerHour: Int = 3
    public static let pulpRescueWinIons: Int = 40
    public static let pulpRescueStabilizeValue: Double = 50.0

    // Habit Bank & Pacer Constants
    public static let brushAlongTotalSec: Double = 120.0
    public static let brushAlongFlossBonusSec: Double = 20.0
    public static let dailyFullRewardCap: Int = 2
    public static let dailyCourtesyTipCap: Int = 3
    public static let brushAlongFullIons: Int = 50
    public static let brushAlongFlossIons: Int = 25
    public static let brushAlongTipIons: Int = 5
    public static let maxSupplyBeacons: Int = 4
    public static let maxOverdriveRuns: Int = 4

    // 4-Pillar Scoring Constants
    public static let scoreMaxRestoration: Int = 5000
    public static let scoreMaxTechnique: Int = 2500
    public static let scoreMaxEcology: Int = 1500
    public static let scoreMaxPartime: Int = 1000
    public static let scoreMinPartimeFloor: Int = 250
    public static let synergyMin: Double = 1.0
    public static let synergyMax: Double = 3.0
    public static let synergyStep: Double = 0.25
    public static let synergyIdleDecayDelaySec: Double = 4.0
    public static let synergyDecayPerSec: Double = 0.15

    // Hitch-Free 3-Tier GPU Quality Governor Constants
    public static let maxParticlesUltra: Int = 400
    public static let fpsDowngradeThreshold: Double = 42.0
    public static let fpsUpgradeThreshold: Double = 57.0
    public static let qualityGovernorCooldownSec: Double = 5.0
    public static let qualityRollingFrames: Int = 90

    // Bounded Powers-of-Ten Camera Rig Constants
    public static let cameraNear: Double = 0.5
    public static let cameraFar: Double = 320.0
    public static let cameraBaseFovDeg: Double = 46.0
    public static let earthBackdropPos = (x: 32.0, y: 110.0, z: 16.0)
    public static let earthBackdropRadius: Double = 18.0
    public static let zoomTransitionSec: Double = 1.35
}
