import Foundation

public enum AppMode: String, Codable, CaseIterable, Sendable {
    case cosmicIntro = "COSMIC_INTRO"
    case hub = "HUB"
    case arcade = "ARCADE"
    case pulpRescue = "PULP_RESCUE"
    case brushAlong = "BRUSH_ALONG"
    case report = "REPORT"
}

public enum QualityTier: String, Codable, CaseIterable, Sendable {
    case low
    case medium
    case ultra
}

public enum QualityPreference: String, Codable, CaseIterable, Sendable {
    case auto
    case low
    case medium
    case ultra

    public var explicitTier: QualityTier? {
        switch self {
        case .auto: return nil
        case .low: return .low
        case .medium: return .medium
        case .ultra: return .ultra
        }
    }
}

public enum BChannelMode: String, Codable, CaseIterable, Sendable {
    case marginDensity
    case gumIrritation
    case localPh
    case epsArmor

    public var shaderIndex: Int32 {
        switch self {
        case .marginDensity: return 0
        case .gumIrritation: return 1
        case .localPh: return 2
        case .epsArmor: return 3
        }
    }
}

public enum ActuatorKind: String, Codable, CaseIterable, Sendable {
    case brush
    case floss
    case rinse
}

public enum MasteryGrade: String, Codable, CaseIterable, Sendable {
    case none = "NONE"
    case c = "C"
    case b = "B"
    case a = "A"
    case s = "S"
    case fluorapatiteGold = "FLUORAPATITE_GOLD"

    public var rank: Int {
        switch self {
        case .none: return 0
        case .c: return 1
        case .b: return 2
        case .a: return 3
        case .s: return 4
        case .fluorapatiteGold: return 5
        }
    }

    public var displayLabel: String {
        switch self {
        case .none: return "—"
        case .c: return "GRADE C"
        case .b: return "GRADE B"
        case .a: return "GRADE A"
        case .s: return "GRADE S"
        case .fluorapatiteGold: return "FLUORAPATITE GOLD"
        }
    }
}

public struct Vec2: Codable, Equatable, Hashable, Sendable {
    public var x: Double
    public var z: Double

    public init(x: Double, z: Double) {
        self.x = x
        self.z = z
    }

    public static let zero = Vec2(x: 0, z: 0)

    public func distance(to other: Vec2) -> Double {
        hypot(x - other.x, z - other.z)
    }
}

public struct AABB2D: Codable, Equatable, Sendable {
    public var minX: Double
    public var minZ: Double
    public var maxX: Double
    public var maxZ: Double

    public init(minX: Double, minZ: Double, maxX: Double, maxZ: Double) {
        self.minX = minX
        self.minZ = minZ
        self.maxX = maxX
        self.maxZ = maxZ
    }

    public func contains(x: Double, z: Double) -> Bool {
        x >= minX && x <= maxX && z >= minZ && z <= maxZ
    }
}

public struct Capsule2D: Codable, Equatable, Sendable {
    public var a: Vec2
    public var b: Vec2
    public var radius: Double
    public var initialDensity: Float

    public init(a: Vec2, b: Vec2, radius: Double, initialDensity: Float) {
        self.a = a
        self.b = b
        self.radius = radius
        self.initialDensity = initialDensity
    }
}

public struct HillDef: Codable, Equatable, Sendable {
    public var cx: Double
    public var cz: Double
    public var radius: Double
    public var height: Double

    public init(cx: Double, cz: Double, radius: Double, height: Double) {
        self.cx = cx
        self.cz = cz
        self.radius = radius
        self.height = height
    }
}

public struct ErosionZoneDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var cx: Double
    public var cz: Double
    public var radius: Double
    public var targetPh: Float

    public init(id: String, cx: Double, cz: Double, radius: Double, targetPh: Float) {
        self.id = id
        self.cx = cx
        self.cz = cz
        self.radius = radius
        self.targetPh = targetPh
    }
}

public struct EpsDomeDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var cx: Double
    public var cz: Double
    public var radius: Double
    public var initialDensity: Float

    public init(id: String, cx: Double, cz: Double, radius: Double, initialDensity: Float) {
        self.id = id
        self.cx = cx
        self.cz = cz
        self.radius = radius
        self.initialDensity = initialDensity
    }
}

public struct CellFlag: OptionSet, Sendable, Equatable {
    public let rawValue: UInt8
    public init(rawValue: UInt8) { self.rawValue = rawValue }

    public static let none           = CellFlag([])
    public static let paintable      = CellFlag(rawValue: 1 << 0)
    public static let interdental    = CellFlag(rawValue: 1 << 1)
    public static let fluorideSealed = CellFlag(rawValue: 1 << 2)
    public static let marginFissure  = CellFlag(rawValue: 1 << 3)
    public static let sulcus         = CellFlag(rawValue: 1 << 4)
    public static let epsArmor       = CellFlag(rawValue: 1 << 5)
}

public struct InterdentalAlleyDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var endpointA: Vec2
    public var endpointB: Vec2
    public var width: Double
    public var wallThickness: Double
    public var bridgeId: String?

    public init(
        id: String,
        endpointA: Vec2,
        endpointB: Vec2,
        width: Double,
        wallThickness: Double,
        bridgeId: String?
    ) {
        self.id = id
        self.endpointA = endpointA
        self.endpointB = endpointB
        self.width = width
        self.wallThickness = wallThickness
        self.bridgeId = bridgeId
    }
}

public struct BridgeDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var a: Vec2
    public var b: Vec2
    public var intact: Bool

    public init(id: String, a: Vec2, b: Vec2, intact: Bool = true) {
        self.id = id
        self.a = a
        self.b = b
        self.intact = intact
    }
}

public struct DistrictDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var subtitle: String
    public var bounds: AABB2D

    public init(id: String, name: String, subtitle: String, bounds: AABB2D) {
        self.id = id
        self.name = name
        self.subtitle = subtitle
        self.bounds = bounds
    }
}

public struct WorldVisualPalette: Codable, Equatable, Sendable {
    public var enamelBaseHex: UInt32
    public var pellicleSlimeHex: UInt32
    public var matureBiofilmHex: UInt32
    public var gingivaHex: UInt32
    public var skyTopHex: UInt32
    public var skyHorizonHex: UInt32

    public init(
        enamelBaseHex: UInt32,
        pellicleSlimeHex: UInt32,
        matureBiofilmHex: UInt32,
        gingivaHex: UInt32,
        skyTopHex: UInt32,
        skyHorizonHex: UInt32
    ) {
        self.enamelBaseHex = enamelBaseHex
        self.pellicleSlimeHex = pellicleSlimeHex
        self.matureBiofilmHex = matureBiofilmHex
        self.gingivaHex = gingivaHex
        self.skyTopHex = skyTopHex
        self.skyHorizonHex = skyHorizonHex
    }
}

public struct CommensalSpawnDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var pos: Vec2
    public var districtIdx: Int

    public init(id: String, pos: Vec2, districtIdx: Int) {
        self.id = id
        self.pos = pos
        self.districtIdx = districtIdx
    }
}

public struct SucroseSpawnDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var pos: Vec2
    public var districtIdx: Int

    public init(id: String, pos: Vec2, districtIdx: Int) {
        self.id = id
        self.pos = pos
        self.districtIdx = districtIdx
    }
}

public struct WorldCartridge: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var subtitle: String
    public var hostId: String
    public var historyNoteIds: [String]
    public var worldWidth: Double
    public var worldDepth: Double
    public var bChannelMode: BChannelMode
    public var parTimeSec: Double
    public var basePellicleDensity: Float
    public var baselinePh: Float
    public var probeSpawn: Vec2
    public var districts: [DistrictDef]
    public var playableMaskBoxes: [AABB2D]
    public var wallBoxes: [AABB2D]
    public var interdentalAlleys: [InterdentalAlleyDef]
    public var marginBands: [Capsule2D]
    public var heightCuspHills: [HillDef]
    public var commensalSiteSpawns: [CommensalSpawnDef]
    public var sucroseSpawns: [SucroseSpawnDef]
    public var biofilmBridges: [BridgeDef]
    public var salivaSprings: [Vec2]
    public var beaconDropSlots: [Vec2]
    public var palette: WorldVisualPalette
    public var sulcusBands: [Capsule2D]?
    public var stephanSipIntervalSec: Double?
    public var erosionZones: [ErosionZoneDef]?
    public var erosionPulseIntervalSec: Double?
    public var epsDomes: [EpsDomeDef]?
    public var challengeBlurb: String?

    public init(
        id: String,
        title: String,
        subtitle: String,
        hostId: String,
        historyNoteIds: [String],
        worldWidth: Double,
        worldDepth: Double,
        bChannelMode: BChannelMode,
        parTimeSec: Double,
        basePellicleDensity: Float,
        baselinePh: Float,
        probeSpawn: Vec2,
        districts: [DistrictDef],
        playableMaskBoxes: [AABB2D],
        wallBoxes: [AABB2D],
        interdentalAlleys: [InterdentalAlleyDef],
        marginBands: [Capsule2D],
        heightCuspHills: [HillDef],
        commensalSiteSpawns: [CommensalSpawnDef],
        sucroseSpawns: [SucroseSpawnDef],
        biofilmBridges: [BridgeDef],
        salivaSprings: [Vec2],
        beaconDropSlots: [Vec2],
        palette: WorldVisualPalette,
        sulcusBands: [Capsule2D]? = nil,
        stephanSipIntervalSec: Double? = nil,
        erosionZones: [ErosionZoneDef]? = nil,
        erosionPulseIntervalSec: Double? = nil,
        epsDomes: [EpsDomeDef]? = nil,
        challengeBlurb: String? = nil
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.hostId = hostId
        self.historyNoteIds = historyNoteIds
        self.worldWidth = worldWidth
        self.worldDepth = worldDepth
        self.bChannelMode = bChannelMode
        self.parTimeSec = parTimeSec
        self.basePellicleDensity = basePellicleDensity
        self.baselinePh = baselinePh
        self.probeSpawn = probeSpawn
        self.districts = districts
        self.playableMaskBoxes = playableMaskBoxes
        self.wallBoxes = wallBoxes
        self.interdentalAlleys = interdentalAlleys
        self.marginBands = marginBands
        self.heightCuspHills = heightCuspHills
        self.commensalSiteSpawns = commensalSiteSpawns
        self.sucroseSpawns = sucroseSpawns
        self.biofilmBridges = biofilmBridges
        self.salivaSprings = salivaSprings
        self.beaconDropSlots = beaconDropSlots
        self.palette = palette
        self.sulcusBands = sulcusBands
        self.stephanSipIntervalSec = stephanSipIntervalSec
        self.erosionZones = erosionZones
        self.erosionPulseIntervalSec = erosionPulseIntervalSec
        self.epsDomes = epsDomes
        self.challengeBlurb = challengeBlurb
    }
}

public struct BrushApplyParams: Sendable {
    public var cx: Double
    public var cz: Double
    public var facingRad: Double
    public var arcRad: Double
    public var radius: Double
    public var removalPerSec: Double
    public var dt: Double
    public var hasBassUpgrade: Bool
    public var hasHydroSonicUpgrade: Bool
    public var sulcusIrritationPerSec: Double
    public var isMovingSweep: Bool
    public var convertToFluorapatite: Bool

    public init(
        cx: Double,
        cz: Double,
        facingRad: Double,
        arcRad: Double,
        radius: Double,
        removalPerSec: Double,
        dt: Double,
        hasBassUpgrade: Bool,
        hasHydroSonicUpgrade: Bool = false,
        sulcusIrritationPerSec: Double = 0,
        isMovingSweep: Bool = false,
        convertToFluorapatite: Bool = false
    ) {
        self.cx = cx
        self.cz = cz
        self.facingRad = facingRad
        self.arcRad = arcRad
        self.radius = radius
        self.removalPerSec = removalPerSec
        self.dt = dt
        self.hasBassUpgrade = hasBassUpgrade
        self.hasHydroSonicUpgrade = hasHydroSonicUpgrade
        self.sulcusIrritationPerSec = sulcusIrritationPerSec
        self.isMovingSweep = isMovingSweep
        self.convertToFluorapatite = convertToFluorapatite
    }
}

public struct ToolApplyResult: Equatable, Sendable {
    public var newlyCleanedCells: Int
    public var densityRemovedTotal: Double
    public var acidAbrasionWarnings: Int
    public var cellsSealed: Int
    public var gumTenderWarnings: Int
    public var epsDeflectWarnings: Int
    public var epsCellsCracked: Int
    public var fluorapatiteConverted: Int

    public init(
        newlyCleanedCells: Int = 0,
        densityRemovedTotal: Double = 0,
        acidAbrasionWarnings: Int = 0,
        cellsSealed: Int = 0,
        gumTenderWarnings: Int = 0,
        epsDeflectWarnings: Int = 0,
        epsCellsCracked: Int = 0,
        fluorapatiteConverted: Int = 0
    ) {
        self.newlyCleanedCells = newlyCleanedCells
        self.densityRemovedTotal = densityRemovedTotal
        self.acidAbrasionWarnings = acidAbrasionWarnings
        self.cellsSealed = cellsSealed
        self.gumTenderWarnings = gumTenderWarnings
        self.epsDeflectWarnings = epsDeflectWarnings
        self.epsCellsCracked = epsCellsCracked
        self.fluorapatiteConverted = fluorapatiteConverted
    }
}

public struct ScoreBreakdown: Codable, Equatable, Sendable {
    public var restorationPts: Int
    public var techniquePts: Int
    public var ecologyPts: Int
    public var parTimePts: Int
    public var totalScore: Int
    public var grade: MasteryGrade
    public var cleanlinessPct: Double
    public var sitesRestored: Int
    public var sitesTotal: Int
    public var elapsedSec: Double
    public var ionsEarned: Int

    public init(
        restorationPts: Int,
        techniquePts: Int,
        ecologyPts: Int,
        parTimePts: Int,
        totalScore: Int,
        grade: MasteryGrade,
        cleanlinessPct: Double,
        sitesRestored: Int,
        sitesTotal: Int,
        elapsedSec: Double,
        ionsEarned: Int
    ) {
        self.restorationPts = restorationPts
        self.techniquePts = techniquePts
        self.ecologyPts = ecologyPts
        self.parTimePts = parTimePts
        self.totalScore = totalScore
        self.grade = grade
        self.cleanlinessPct = cleanlinessPct
        self.sitesRestored = sitesRestored
        self.sitesTotal = sitesTotal
        self.elapsedSec = elapsedSec
        self.ionsEarned = ionsEarned
    }
}

public struct CompanionState: Codable, Equatable, Sendable {
    public var smoothnessIndex: Double
    public var enamelShield: Double
    public var dentinShield: Double
    public var pulpIntegrity: Double
    public var unclaimedIdleIons: Int
    public var recentTreatTimestampsMs: [Int64]
    public var lastEvaluatedEpochMs: Int64

    public init(
        smoothnessIndex: Double,
        enamelShield: Double,
        dentinShield: Double,
        pulpIntegrity: Double,
        unclaimedIdleIons: Int,
        recentTreatTimestampsMs: [Int64],
        lastEvaluatedEpochMs: Int64
    ) {
        self.smoothnessIndex = smoothnessIndex
        self.enamelShield = enamelShield
        self.dentinShield = dentinShield
        self.pulpIntegrity = pulpIntegrity
        self.unclaimedIdleIons = unclaimedIdleIons
        self.recentTreatTimestampsMs = recentTreatTimestampsMs
        self.lastEvaluatedEpochMs = lastEvaluatedEpochMs
    }
}

public struct WorldRecord: Codable, Equatable, Sendable {
    public var unlocked: Bool
    public var completed: Bool
    public var timesCleared: Int
    public var bestScore: Int
    public var bestGrade: MasteryGrade
    public var bestCleanlinessPct: Double
    public var sitesRestoredMax: Int

    public init(
        unlocked: Bool = false,
        completed: Bool = false,
        timesCleared: Int = 0,
        bestScore: Int = 0,
        bestGrade: MasteryGrade = .none,
        bestCleanlinessPct: Double = 0,
        sitesRestoredMax: Int = 0
    ) {
        self.unlocked = unlocked
        self.completed = completed
        self.timesCleared = timesCleared
        self.bestScore = bestScore
        self.bestGrade = bestGrade
        self.bestCleanlinessPct = bestCleanlinessPct
        self.sitesRestoredMax = sitesRestoredMax
    }
}

public struct PlayerHostProfile: Codable, Equatable, Sendable {
    public var displayName: String
    public var skinToneIndex: Int
    public var homeCityId: String

    public init(displayName: String, skinToneIndex: Int, homeCityId: String) {
        self.displayName = displayName
        self.skinToneIndex = skinToneIndex
        self.homeCityId = homeCityId
    }
}

public struct DailySlotLog: Codable, Equatable, Sendable {
    public var fullRewards: Int
    public var tips: Int

    public init(fullRewards: Int = 0, tips: Int = 0) {
        self.fullRewards = fullRewards
        self.tips = tips
    }
}

public struct EquippedUpgrades: Codable, Equatable, Sendable {
    public var brush: String?
    public var floss: String?
    public var rinse: String?

    public init(brush: String? = nil, floss: String? = nil, rinse: String? = nil) {
        self.brush = brush
        self.floss = floss
        self.rinse = rinse
    }

    public subscript(slot: ActuatorKind) -> String? {
        get {
            switch slot {
            case .brush: return brush
            case .floss: return floss
            case .rinse: return rinse
            }
        }
        set {
            switch slot {
            case .brush: brush = newValue
            case .floss: floss = newValue
            case .rinse: rinse = newValue
            }
        }
    }

    // Encode explicit nulls so JSON matches TypeScript JSON.stringify exactly for ML2: cross-platform sync!
    enum CodingKeys: String, CodingKey {
        case brush, floss, rinse
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let brush { try container.encode(brush, forKey: .brush) } else { try container.encodeNil(forKey: .brush) }
        if let floss { try container.encode(floss, forKey: .floss) } else { try container.encodeNil(forKey: .floss) }
        if let rinse { try container.encode(rinse, forKey: .rinse) } else { try container.encodeNil(forKey: .rinse) }
    }
}

public struct MouthLifeSaveV2: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var saveRevision: Int
    public var lastSavedEpochMs: Int64
    public var hasSeenCosmicIntro: Bool
    public var playerProfile: PlayerHostProfile
    public var companion: CompanionState
    public var totalBrushStamps: Int
    public var fluorideIons: Int
    public var dailySlotsByDate: [String: DailySlotLog]
    public var pendingSupplyBeacons: Int
    public var remineralizedOverdriveRuns: Int
    public var unlockedUpgrades: [String]
    public var equippedUpgrades: EquippedUpgrades
    public var unlockedHistoryNotes: [String]
    public var qualityPreference: QualityPreference
    public var worlds: [String: WorldRecord]

    public init(
        schemaVersion: Int = 2,
        saveRevision: Int = 1,
        lastSavedEpochMs: Int64,
        hasSeenCosmicIntro: Bool = false,
        playerProfile: PlayerHostProfile,
        companion: CompanionState,
        totalBrushStamps: Int = 0,
        fluorideIons: Int = 0,
        dailySlotsByDate: [String: DailySlotLog] = [:],
        pendingSupplyBeacons: Int = 0,
        remineralizedOverdriveRuns: Int = 0,
        unlockedUpgrades: [String] = [],
        equippedUpgrades: EquippedUpgrades = EquippedUpgrades(),
        unlockedHistoryNotes: [String] = ["cosmic_hydroxyapatite"],
        qualityPreference: QualityPreference = .auto,
        worlds: [String: WorldRecord] = [:]
    ) {
        self.schemaVersion = schemaVersion
        self.saveRevision = saveRevision
        self.lastSavedEpochMs = lastSavedEpochMs
        self.hasSeenCosmicIntro = hasSeenCosmicIntro
        self.playerProfile = playerProfile
        self.companion = companion
        self.totalBrushStamps = totalBrushStamps
        self.fluorideIons = fluorideIons
        self.dailySlotsByDate = dailySlotsByDate
        self.pendingSupplyBeacons = pendingSupplyBeacons
        self.remineralizedOverdriveRuns = remineralizedOverdriveRuns
        self.unlockedUpgrades = unlockedUpgrades
        self.equippedUpgrades = equippedUpgrades
        self.unlockedHistoryNotes = unlockedHistoryNotes
        self.qualityPreference = qualityPreference
        self.worlds = worlds
    }
}

public struct UpgradeDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var slot: ActuatorKind
    public var name: String
    public var tagline: String
    public var scientificNote: String
    public var stampUnlockThreshold: Int?
    public var worldClearUnlockId: String?
    public var ionCost: Int

    public init(
        id: String,
        slot: ActuatorKind,
        name: String,
        tagline: String,
        scientificNote: String,
        stampUnlockThreshold: Int?,
        worldClearUnlockId: String?,
        ionCost: Int
    ) {
        self.id = id
        self.slot = slot
        self.name = name
        self.tagline = tagline
        self.scientificNote = scientificNote
        self.stampUnlockThreshold = stampUnlockThreshold
        self.worldClearUnlockId = worldClearUnlockId
        self.ionCost = ionCost
    }
}

public struct RegionalTreatDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var city: String
    public var emoji: String
    public var phDropNote: String

    public init(id: String, name: String, city: String, emoji: String, phDropNote: String) {
        self.id = id
        self.name = name
        self.city = city
        self.emoji = emoji
        self.phDropNote = phDropNote
    }
}

public struct HostCityDef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var worldId: String
    public var city: String
    public var country: String
    public var lat: Double
    public var lon: Double
    public var isOrbital: Bool
    public var hostName: String
    public var hostRole: String
    public var hostSkinToneHex: String
    public var hostAccentHex: String
    public var unlockStampsRequired: Int
    public var playableInSlice: Bool
    public var scenarioSummary: String
    public var historyNoteId: String
    public var signatureTreat: RegionalTreatDef

    public init(
        id: String,
        worldId: String,
        city: String,
        country: String,
        lat: Double,
        lon: Double,
        isOrbital: Bool = false,
        hostName: String,
        hostRole: String,
        hostSkinToneHex: String,
        hostAccentHex: String,
        unlockStampsRequired: Int,
        playableInSlice: Bool,
        scenarioSummary: String,
        historyNoteId: String,
        signatureTreat: RegionalTreatDef
    ) {
        self.id = id
        self.worldId = worldId
        self.city = city
        self.country = country
        self.lat = lat
        self.lon = lon
        self.isOrbital = isOrbital
        self.hostName = hostName
        self.hostRole = hostRole
        self.hostSkinToneHex = hostSkinToneHex
        self.hostAccentHex = hostAccentHex
        self.unlockStampsRequired = unlockStampsRequired
        self.playableInSlice = playableInSlice
        self.scenarioSummary = scenarioSummary
        self.historyNoteId = historyNoteId
        self.signatureTreat = signatureTreat
    }
}

public struct HistoricalFieldNote: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var yearLabel: String
    public var locationLabel: String
    public var title: String
    public var scientistOrCulture: String
    public var summary: String
    public var enamelLesson: String

    public init(
        id: String,
        yearLabel: String,
        locationLabel: String,
        title: String,
        scientistOrCulture: String,
        summary: String,
        enamelLesson: String
    ) {
        self.id = id
        self.yearLabel = yearLabel
        self.locationLabel = locationLabel
        self.title = title
        self.scientistOrCulture = scientistOrCulture
        self.summary = summary
        self.enamelLesson = enamelLesson
    }
}

public struct ProbeZipState: Equatable, Sendable {
    public var from: Vec2
    public var to: Vec2
    public var elapsed: Double
    public var duration: Double

    public init(from: Vec2, to: Vec2, elapsed: Double = 0, duration: Double) {
        self.from = from
        self.to = to
        self.elapsed = elapsed
        self.duration = duration
    }
}

public struct MutansEntity: Equatable, Sendable, Identifiable {
    public var id: Int
    public var pos: Vec2
    public var vel: Vec2
    public var hopPhase: Double
    public var hp: Double
    public var stunRemaining: Double
    public var acidDropCooldown: Double
    public var parentSucroseId: String

    public init(
        id: Int,
        pos: Vec2,
        vel: Vec2,
        hopPhase: Double,
        hp: Double,
        stunRemaining: Double,
        acidDropCooldown: Double,
        parentSucroseId: String
    ) {
        self.id = id
        self.pos = pos
        self.vel = vel
        self.hopPhase = hopPhase
        self.hp = hp
        self.stunRemaining = stunRemaining
        self.acidDropCooldown = acidDropCooldown
        self.parentSucroseId = parentSucroseId
    }
}

public struct AcidPoolEntity: Equatable, Sendable, Identifiable {
    public var id: Int
    public var pos: Vec2
    public var radius: Double
    public var remainingSec: Double

    public init(id: Int, pos: Vec2, radius: Double, remainingSec: Double) {
        self.id = id
        self.pos = pos
        self.radius = radius
        self.remainingSec = remainingSec
    }
}

public struct CommensalSiteEntity: Equatable, Sendable, Identifiable {
    public var id: String
    public var pos: Vec2
    public var districtIdx: Int
    public var restored: Bool
    public var localCleanRatio: Double

    public init(id: String, pos: Vec2, districtIdx: Int, restored: Bool, localCleanRatio: Double) {
        self.id = id
        self.pos = pos
        self.districtIdx = districtIdx
        self.restored = restored
        self.localCleanRatio = localCleanRatio
    }
}

public struct SucroseCrystalEntity: Equatable, Sendable, Identifiable {
    public var id: String
    public var pos: Vec2
    public var districtIdx: Int
    public var hp: Double
    public var intact: Bool
    public var spawnTimer: Double

    public init(id: String, pos: Vec2, districtIdx: Int, hp: Double, intact: Bool, spawnTimer: Double) {
        self.id = id
        self.pos = pos
        self.districtIdx = districtIdx
        self.hp = hp
        self.intact = intact
        self.spawnTimer = spawnTimer
    }
}

public struct RelayBeaconEntity: Equatable, Sendable, Identifiable {
    public var id: Int { index }
    public var index: Int
    public var pos: Vec2
    public var collected: Bool

    public init(index: Int, pos: Vec2, collected: Bool) {
        self.index = index
        self.pos = pos
        self.collected = collected
    }
}

public enum ActivePlayMode: String, Codable, Equatable, Sendable {
    case arcade = "ARCADE"
    case pulpRescue = "PULP_RESCUE"
}

public enum UpgradeUnlockVia: String, Equatable, Sendable {
    case stamps
    case worldClear = "world_clear"
    case ions
}

public enum GameEvent: Sendable {
    case modeChanged(from: AppMode, to: AppMode)
    case actuatorScrub(cleanRatio: Double, newlyCleaned: Int, surgeDelta: Double, acidWarn: Bool)
    case flossSliced(from: Vec2, to: Vec2, targetsHit: Int, surgeDelta: Double, zipped: Bool, epsCellsCracked: Int)
    case rinseSurged(origin: Vec2, cellsSealed: Int)
    case disclosePulsed(origin: Vec2, durationSec: Double)
    case siteRestored(siteId: String, pos: Vec2, districtIdx: Int, surgeDelta: Double)
    case districtSealed(districtIdx: Int, districtName: String, worldCleanRatio: Double)
    case beaconCollected(beaconIndex: Int, pos: Vec2, surgeDelta: Double)
    case missionComplete(mode: ActivePlayMode, worldId: String, won: Bool, breakdown: ScoreBreakdown, unlockedHistoryNoteId: String?)
    case upgradeUnlocked(upgradeId: String, via: UpgradeUnlockVia, costPaid: Int)
    case companionUpdated(state: CompanionState)
    case pacerTick(elapsedSec: Double, quadrantIdx: Int, surfaceIdx: Int, inFlossBonus: Bool)
    case pacerPaused(paused: Bool)
    case pacerComplete(withFlossBonus: Bool, ionsAwarded: Int, stampAwarded: Bool)
    case qualityChanged(tier: QualityTier, fps: Int)
    case sucroseShattered(crystalId: String, pos: Vec2, via: ActuatorKind)
    case gumTender(pos: Vec2, warnings: Int)
    case stephanSip(sipIndex: Int, recoverySec: Double)
    case stephanBuffered(pos: Vec2, remainingSec: Double)
    case erosionWash(washIndex: Int, targetPh: Float)
    case fluorapatiteInfused(pos: Vec2, cellsConverted: Int, durationSec: Double)
    case epsDeflected(pos: Vec2, warnings: Int)
    case epsCracked(pos: Vec2, cellsCracked: Int, via: ActuatorKind)
    case springTriggered(pos: Vec2)
    case mutansBumped(pos: Vec2)
    case mutansPopped(pos: Vec2, via: String)
    case surgeReady
    case audioChanged(muted: Bool, musicVolume: Float, sfxVolume: Float)
    case motionChanged(reduced: Bool)
    case saveUpdated(save: MouthLifeSaveV2)
}

public final class EventBus {
    private var nextToken: Int = 1
    private var handlers: [Int: (GameEvent) -> Void] = [:]

    public init() {}

    @discardableResult
    public func subscribe(_ handler: @escaping (GameEvent) -> Void) -> () -> Void {
        let token = nextToken
        nextToken += 1
        handlers[token] = handler
        return { [weak self] in
            self?.handlers.removeValue(forKey: token)
        }
    }

    public func emit(_ event: GameEvent) {
        let snapshot = Array(handlers.values)
        for handler in snapshot {
            handler(event)
        }
    }
}
