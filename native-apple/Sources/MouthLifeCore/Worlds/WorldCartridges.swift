import Foundation

/// World 1 — Toronto Morning Arch ("Plaque City").
/// Honors 1498 Beijing hog-bristle toothbrush & 1683 Delft Antonie van Leeuwenhoek oral microscopy.
public let world1AnteriorIncisors = WorldCartridge(
    id: "world_1",
    title: "Plaque City",
    subtitle: "Toronto Morning Arch • Honoring 1498 Beijing & 1683 Delft",
    hostId: "toronto",
    historyNoteIds: ["1498_beijing_1683_delft"],
    worldWidth: 64.0,
    worldDepth: 32.0,
    bChannelMode: .marginDensity,
    parTimeSec: 270.0,
    basePellicleDensity: 0.48,
    baselinePh: 7.0,
    probeSpawn: Vec2(x: 7.5, z: 16.0),
    districts: [
        DistrictDef(
            id: "incisor_terrace",
            name: "Front Teeth Terrace",
            subtitle: "Wide Sweeps & the Gumline",
            bounds: AABB2D(minX: 2.5, minZ: 4.5, maxX: 22.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "premolar_contacts",
            name: "Premolar Gap Alleys",
            subtitle: "Floss & Floss Zip",
            bounds: AABB2D(minX: 22.0, minZ: 4.5, maxX: 42.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "first_molar_basin",
            name: "First Molar Bowl",
            subtitle: "Clean Grooves, Stop Sugar & Fire Surge",
            bounds: AABB2D(minX: 42.0, minZ: 4.5, maxX: 61.5, maxZ: 27.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 3.0, minZ: 5.0, maxX: 22.0, maxZ: 27.0),
        AABB2D(minX: 22.0, minZ: 5.0, maxX: 42.0, maxZ: 27.0),
        AABB2D(minX: 42.0, minZ: 5.0, maxX: 61.0, maxZ: 27.0)
    ],
    wallBoxes: [
        AABB2D(minX: 30.59, minZ: 11.45, maxX: 33.41, maxZ: 20.55),
        AABB2D(minX: 30.59, minZ: 4.5, maxX: 33.41, maxZ: 7.1),
        AABB2D(minX: 30.59, minZ: 24.9, maxX: 33.41, maxZ: 27.5)
    ],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "alley_premolar_north",
            endpointA: Vec2(x: 30.2, z: 10.5),
            endpointB: Vec2(x: 33.8, z: 10.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_north"
        ),
        InterdentalAlleyDef(
            id: "alley_premolar_south",
            endpointA: Vec2(x: 30.2, z: 21.5),
            endpointB: Vec2(x: 33.8, z: 21.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_south"
        ),
        InterdentalAlleyDef(
            id: "alley_molar_crevice",
            endpointA: Vec2(x: 43.2, z: 16.0),
            endpointB: Vec2(x: 46.6, z: 16.0),
            width: 0.9,
            wallThickness: 1.8,
            bridgeId: "bridge_molar"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 4.0, z: 26.2), b: Vec2(x: 21.0, z: 26.2), radius: 1.35, initialDensity: 0.85),
        Capsule2D(a: Vec2(x: 4.0, z: 5.8), b: Vec2(x: 21.0, z: 5.8), radius: 1.15, initialDensity: 0.8),
        Capsule2D(a: Vec2(x: 47.5, z: 16.0), b: Vec2(x: 58.5, z: 16.0), radius: 1.25, initialDensity: 0.86),
        Capsule2D(a: Vec2(x: 53.0, z: 9.5), b: Vec2(x: 53.0, z: 22.5), radius: 1.25, initialDensity: 0.86)
    ],
    heightCuspHills: [
        HillDef(cx: 12.5, cz: 16.0, radius: 11.0, height: 1.1),
        HillDef(cx: 26.2, cz: 9.0, radius: 5.5, height: 1.6),
        HillDef(cx: 26.2, cz: 23.0, radius: 5.5, height: 1.6),
        HillDef(cx: 37.8, cz: 9.0, radius: 5.5, height: 1.6),
        HillDef(cx: 37.8, cz: 23.0, radius: 5.5, height: 1.6),
        HillDef(cx: 49.0, cz: 10.0, radius: 6.2, height: 2.1),
        HillDef(cx: 57.5, cz: 10.0, radius: 6.2, height: 2.1),
        HillDef(cx: 49.0, cz: 22.0, radius: 6.2, height: 2.1),
        HillDef(cx: 57.5, cz: 22.0, radius: 6.2, height: 2.1)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "site_d0_1", pos: Vec2(x: 10.5, z: 10.0), districtIdx: 0),
        CommensalSpawnDef(id: "site_d0_2", pos: Vec2(x: 14.5, z: 22.5), districtIdx: 0),
        CommensalSpawnDef(id: "site_d0_3", pos: Vec2(x: 19.0, z: 14.5), districtIdx: 0),
        CommensalSpawnDef(id: "site_d1_1", pos: Vec2(x: 26.0, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "site_d1_2", pos: Vec2(x: 37.5, z: 11.0), districtIdx: 1),
        CommensalSpawnDef(id: "site_d1_3", pos: Vec2(x: 37.5, z: 21.0), districtIdx: 1),
        CommensalSpawnDef(id: "site_d2_1", pos: Vec2(x: 49.0, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "site_d2_2", pos: Vec2(x: 57.5, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "site_d2_3", pos: Vec2(x: 49.0, z: 21.5), districtIdx: 2),
        CommensalSpawnDef(id: "site_d2_4", pos: Vec2(x: 57.5, z: 21.5), districtIdx: 2)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "sucrose_p1", pos: Vec2(x: 28.0, z: 10.5), districtIdx: 1),
        SucroseSpawnDef(id: "sucrose_p2", pos: Vec2(x: 36.2, z: 21.5), districtIdx: 1),
        SucroseSpawnDef(id: "sucrose_m1", pos: Vec2(x: 53.0, z: 16.0), districtIdx: 2),
        SucroseSpawnDef(id: "sucrose_m2", pos: Vec2(x: 58.2, z: 16.0), districtIdx: 2)
    ],
    biofilmBridges: [
        BridgeDef(id: "bridge_north", a: Vec2(x: 31.8, z: 9.8), b: Vec2(x: 31.8, z: 11.2), intact: true),
        BridgeDef(id: "bridge_south", a: Vec2(x: 31.8, z: 20.8), b: Vec2(x: 31.8, z: 22.2), intact: true),
        BridgeDef(id: "bridge_molar", a: Vec2(x: 44.9, z: 15.3), b: Vec2(x: 44.9, z: 16.7), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 13.0, z: 16.0),
        Vec2(x: 38.5, z: 16.0),
        Vec2(x: 53.0, z: 11.5)
    ],
    beaconDropSlots: [
        Vec2(x: 12.0, z: 19.0),
        Vec2(x: 26.5, z: 13.0),
        Vec2(x: 38.0, z: 18.0),
        Vec2(x: 51.0, z: 18.5)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xf4fbff,
        pellicleSlimeHex: 0xd9e35b,
        matureBiofilmHex: 0x9fb82c,
        gingivaHex: 0xe66c7e,
        skyTopHex: 0x051624,
        skyHorizonHex: 0x0f3b52
    ),
    challengeBlurb: "Sweep the morning film off all 3 zones, Floss-zip the narrow gaps, and fire Surge to seal the molar grooves!"
)

/// World 2 — New Orleans Evening Arch ("Crescent Sulcus").
/// Honors Levi Spear Parmly's 1819 waxed-silk floss and Dr. Charles C. Bass's 1948 Tulane 45° sulcus method.
public let world2PremolarAlley = WorldCartridge(
    id: "world_2",
    title: "Gumline Crescent",
    subtitle: "New Orleans Evening Arch • Honoring 1819 Parmly & 1948 Bass",
    hostId: "new_orleans",
    historyNoteIds: ["1819_1948_new_orleans"],
    worldWidth: 64.0,
    worldDepth: 32.0,
    bChannelMode: .gumIrritation,
    parTimeSec: 300.0,
    basePellicleDensity: 0.5,
    baselinePh: 7.0,
    probeSpawn: Vec2(x: 7.5, z: 16.0),
    districts: [
        DistrictDef(
            id: "canine_sulcus_levee",
            name: "Canine Gumline Bank",
            subtitle: "Gentle 45° Bass Sweeps Along the Gumline",
            bounds: AABB2D(minX: 2.5, minZ: 4.5, maxX: 22.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "parmly_silk_row",
            name: "Parmly Silk Contact Row",
            subtitle: "Zig-Zag Gaps & Floss Zips",
            bounds: AABB2D(minX: 22.0, minZ: 4.5, maxX: 42.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "premolar_sulcus_bayou",
            name: "Premolar Gumline Bayou",
            subtitle: "Groove Cleaning & Sore Gum Edges",
            bounds: AABB2D(minX: 42.0, minZ: 4.5, maxX: 61.5, maxZ: 27.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 3.0, minZ: 5.0, maxX: 22.0, maxZ: 27.0),
        AABB2D(minX: 22.0, minZ: 5.0, maxX: 42.0, maxZ: 27.0),
        AABB2D(minX: 42.0, minZ: 5.0, maxX: 61.0, maxZ: 27.0)
    ],
    wallBoxes: [
        AABB2D(minX: 26.59, minZ: 4.5, maxX: 29.41, maxZ: 6.1),
        AABB2D(minX: 26.59, minZ: 12.9, maxX: 29.41, maxZ: 27.5),
        AABB2D(minX: 34.59, minZ: 4.5, maxX: 37.41, maxZ: 19.1),
        AABB2D(minX: 34.59, minZ: 25.9, maxX: 37.41, maxZ: 27.5)
    ],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "alley_silk_north",
            endpointA: Vec2(x: 26.2, z: 9.5),
            endpointB: Vec2(x: 29.8, z: 9.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_silk_north"
        ),
        InterdentalAlleyDef(
            id: "alley_silk_south",
            endpointA: Vec2(x: 34.2, z: 22.5),
            endpointB: Vec2(x: 37.8, z: 22.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_silk_south"
        ),
        InterdentalAlleyDef(
            id: "alley_bayou_crevice",
            endpointA: Vec2(x: 47.2, z: 16.0),
            endpointB: Vec2(x: 50.6, z: 16.0),
            width: 0.9,
            wallThickness: 1.8,
            bridgeId: "bridge_bayou"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 44.5, z: 16.0), b: Vec2(x: 59.0, z: 16.0), radius: 1.1, initialDensity: 0.84),
        Capsule2D(a: Vec2(x: 53.0, z: 9.8), b: Vec2(x: 53.0, z: 22.2), radius: 1.1, initialDensity: 0.84)
    ],
    heightCuspHills: [
        HillDef(cx: 12.5, cz: 16.0, radius: 10.0, height: 1.5),
        HillDef(cx: 24.4, cz: 11.0, radius: 4.4, height: 1.4),
        HillDef(cx: 24.4, cz: 21.0, radius: 4.4, height: 1.4),
        HillDef(cx: 32.0, cz: 12.0, radius: 3.8, height: 1.2),
        HillDef(cx: 32.0, cz: 20.0, radius: 3.8, height: 1.2),
        HillDef(cx: 39.6, cz: 11.0, radius: 4.4, height: 1.4),
        HillDef(cx: 39.6, cz: 21.0, radius: 4.4, height: 1.4),
        HillDef(cx: 47.0, cz: 10.0, radius: 6.0, height: 2.0),
        HillDef(cx: 56.5, cz: 10.0, radius: 6.0, height: 2.0),
        HillDef(cx: 47.0, cz: 22.0, radius: 6.0, height: 2.0),
        HillDef(cx: 56.5, cz: 22.0, radius: 6.0, height: 2.0)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "nola_d0_1", pos: Vec2(x: 9.0, z: 11.0), districtIdx: 0),
        CommensalSpawnDef(id: "nola_d0_2", pos: Vec2(x: 15.0, z: 21.0), districtIdx: 0),
        CommensalSpawnDef(id: "nola_d0_3", pos: Vec2(x: 19.5, z: 14.0), districtIdx: 0),
        CommensalSpawnDef(id: "nola_d1_1", pos: Vec2(x: 24.5, z: 18.0), districtIdx: 1),
        CommensalSpawnDef(id: "nola_d1_2", pos: Vec2(x: 32.0, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "nola_d1_3", pos: Vec2(x: 39.5, z: 12.0), districtIdx: 1),
        CommensalSpawnDef(id: "nola_d2_1", pos: Vec2(x: 47.0, z: 10.0), districtIdx: 2),
        CommensalSpawnDef(id: "nola_d2_2", pos: Vec2(x: 56.0, z: 10.0), districtIdx: 2),
        CommensalSpawnDef(id: "nola_d2_3", pos: Vec2(x: 47.0, z: 22.0), districtIdx: 2),
        CommensalSpawnDef(id: "nola_d2_4", pos: Vec2(x: 56.0, z: 22.0), districtIdx: 2)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "beignet_s1", pos: Vec2(x: 24.5, z: 10.0), districtIdx: 1),
        SucroseSpawnDef(id: "beignet_s2", pos: Vec2(x: 39.5, z: 22.0), districtIdx: 1),
        SucroseSpawnDef(id: "beignet_s3", pos: Vec2(x: 54.5, z: 16.0), districtIdx: 2)
    ],
    biofilmBridges: [
        BridgeDef(id: "bridge_silk_north", a: Vec2(x: 28.0, z: 8.8), b: Vec2(x: 28.0, z: 10.2), intact: true),
        BridgeDef(id: "bridge_silk_south", a: Vec2(x: 36.0, z: 21.8), b: Vec2(x: 36.0, z: 23.2), intact: true),
        BridgeDef(id: "bridge_bayou", a: Vec2(x: 48.9, z: 15.3), b: Vec2(x: 48.9, z: 16.7), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 12.5, z: 21.5),
        Vec2(x: 32.0, z: 9.0),
        Vec2(x: 52.0, z: 10.5)
    ],
    beaconDropSlots: [
        Vec2(x: 11.0, z: 10.0),
        Vec2(x: 24.0, z: 22.5),
        Vec2(x: 32.0, z: 22.0),
        Vec2(x: 51.0, z: 20.0)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xfff8f0,
        pellicleSlimeHex: 0xe8d27a,
        matureBiofilmHex: 0xb08a3a,
        gingivaHex: 0xe25d74,
        skyTopHex: 0x1a0c24,
        skyHorizonHex: 0x4b1d4f
    ),
    sulcusBands: [
        Capsule2D(a: Vec2(x: 4.0, z: 26.2), b: Vec2(x: 21.0, z: 26.2), radius: 1.3, initialDensity: 0.82),
        Capsule2D(a: Vec2(x: 4.0, z: 5.8), b: Vec2(x: 21.0, z: 5.8), radius: 1.2, initialDensity: 0.8),
        Capsule2D(a: Vec2(x: 30.2, z: 26.2), b: Vec2(x: 33.8, z: 26.2), radius: 1.2, initialDensity: 0.8),
        Capsule2D(a: Vec2(x: 43.0, z: 26.2), b: Vec2(x: 60.0, z: 26.2), radius: 1.3, initialDensity: 0.82),
        Capsule2D(a: Vec2(x: 43.0, z: 5.8), b: Vec2(x: 60.0, z: 5.8), radius: 1.2, initialDensity: 0.8)
    ],
    challengeBlurb: "Sweep gently along the pink gumline. Scrubbing hard in one spot makes gums sore. Floss-zip the tight gaps!"
)

/// World 3 — Tokyo Studio Arch & 1940 Chicago pH Lab ("Neon Acid Clock").
/// Honors Dr. Robert M. Stephan's 1940 pH electrode curve.
public let world3FirstMolarCitadel = WorldCartridge(
    id: "world_3",
    title: "Neon Acid Clock",
    subtitle: "Tokyo Studio Arch • Honoring the 1940 Chicago Acid Clock",
    hostId: "tokyo",
    historyNoteIds: ["1940_chicago_stephan"],
    worldWidth: 64.0,
    worldDepth: 32.0,
    bChannelMode: .localPh,
    parTimeSec: 300.0,
    basePellicleDensity: 0.46,
    baselinePh: 6.9,
    probeSpawn: Vec2(x: 7.5, z: 16.0),
    districts: [
        DistrictDef(
            id: "shibuya_incisor_stage",
            name: "Shibuya Front-Tooth Stage",
            subtitle: "Broad Sweeps Between Sweet Sips",
            bounds: AABB2D(minX: 2.5, minZ: 4.5, maxX: 22.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "studio_mixing_contacts",
            name: "Studio Desk Gaps",
            subtitle: "Gap Zips & Soda Sips",
            bounds: AABB2D(minX: 22.0, minZ: 4.5, maxX: 42.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "chicago_molar_lab",
            name: "Chicago Molar Acid Lab",
            subtitle: "Acid Grooves & Saliva Buffer",
            bounds: AABB2D(minX: 42.0, minZ: 4.5, maxX: 61.5, maxZ: 27.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 3.0, minZ: 5.0, maxX: 22.0, maxZ: 27.0),
        AABB2D(minX: 22.0, minZ: 5.0, maxX: 42.0, maxZ: 27.0),
        AABB2D(minX: 42.0, minZ: 5.0, maxX: 61.0, maxZ: 27.0)
    ],
    wallBoxes: [
        AABB2D(minX: 30.59, minZ: 11.45, maxX: 33.41, maxZ: 20.55),
        AABB2D(minX: 30.59, minZ: 4.5, maxX: 33.41, maxZ: 7.1),
        AABB2D(minX: 30.59, minZ: 24.9, maxX: 33.41, maxZ: 27.5)
    ],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "alley_mixdesk_north",
            endpointA: Vec2(x: 30.2, z: 10.5),
            endpointB: Vec2(x: 33.8, z: 10.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_mix_north"
        ),
        InterdentalAlleyDef(
            id: "alley_mixdesk_south",
            endpointA: Vec2(x: 30.2, z: 21.5),
            endpointB: Vec2(x: 33.8, z: 21.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_mix_south"
        ),
        InterdentalAlleyDef(
            id: "alley_lab_crevice",
            endpointA: Vec2(x: 43.2, z: 16.0),
            endpointB: Vec2(x: 46.6, z: 16.0),
            width: 0.9,
            wallThickness: 1.8,
            bridgeId: "bridge_lab"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 4.0, z: 26.2), b: Vec2(x: 21.0, z: 26.2), radius: 1.2, initialDensity: 0.82),
        Capsule2D(a: Vec2(x: 47.5, z: 16.0), b: Vec2(x: 58.5, z: 16.0), radius: 1.2, initialDensity: 0.86),
        Capsule2D(a: Vec2(x: 53.0, z: 9.5), b: Vec2(x: 53.0, z: 22.5), radius: 1.2, initialDensity: 0.86)
    ],
    heightCuspHills: [
        HillDef(cx: 12.5, cz: 16.0, radius: 11.0, height: 1.0),
        HillDef(cx: 26.2, cz: 9.0, radius: 5.5, height: 1.5),
        HillDef(cx: 26.2, cz: 23.0, radius: 5.5, height: 1.5),
        HillDef(cx: 37.8, cz: 9.0, radius: 5.5, height: 1.5),
        HillDef(cx: 37.8, cz: 23.0, radius: 5.5, height: 1.5),
        HillDef(cx: 49.0, cz: 10.0, radius: 6.2, height: 2.2),
        HillDef(cx: 57.5, cz: 10.0, radius: 6.2, height: 2.2),
        HillDef(cx: 49.0, cz: 22.0, radius: 6.2, height: 2.2),
        HillDef(cx: 57.5, cz: 22.0, radius: 6.2, height: 2.2)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "tokyo_d0_1", pos: Vec2(x: 8.0, z: 10.0), districtIdx: 0),
        CommensalSpawnDef(id: "tokyo_d0_2", pos: Vec2(x: 12.0, z: 22.0), districtIdx: 0),
        CommensalSpawnDef(id: "tokyo_d0_3", pos: Vec2(x: 19.0, z: 16.0), districtIdx: 0),
        CommensalSpawnDef(id: "tokyo_d1_1", pos: Vec2(x: 26.0, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "tokyo_d1_2", pos: Vec2(x: 37.5, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "tokyo_d1_3", pos: Vec2(x: 26.5, z: 7.5), districtIdx: 1),
        CommensalSpawnDef(id: "tokyo_d2_1", pos: Vec2(x: 49.0, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "tokyo_d2_2", pos: Vec2(x: 57.5, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "tokyo_d2_3", pos: Vec2(x: 49.0, z: 21.5), districtIdx: 2),
        CommensalSpawnDef(id: "tokyo_d2_4", pos: Vec2(x: 57.5, z: 21.5), districtIdx: 2)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "soda_sip_1", pos: Vec2(x: 17.0, z: 9.0), districtIdx: 0),
        SucroseSpawnDef(id: "soda_sip_2", pos: Vec2(x: 27.0, z: 22.0), districtIdx: 1),
        SucroseSpawnDef(id: "soda_sip_3", pos: Vec2(x: 37.0, z: 10.0), districtIdx: 1),
        SucroseSpawnDef(id: "soda_sip_4", pos: Vec2(x: 55.0, z: 16.0), districtIdx: 2)
    ],
    biofilmBridges: [
        BridgeDef(id: "bridge_mix_north", a: Vec2(x: 31.8, z: 9.8), b: Vec2(x: 31.8, z: 11.2), intact: true),
        BridgeDef(id: "bridge_mix_south", a: Vec2(x: 31.8, z: 20.8), b: Vec2(x: 31.8, z: 22.2), intact: true),
        BridgeDef(id: "bridge_lab", a: Vec2(x: 44.9, z: 15.3), b: Vec2(x: 44.9, z: 16.7), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 10.0, z: 20.0),
        Vec2(x: 27.0, z: 11.0),
        Vec2(x: 37.5, z: 21.0),
        Vec2(x: 50.5, z: 16.0)
    ],
    beaconDropSlots: [
        Vec2(x: 13.0, z: 13.0),
        Vec2(x: 26.0, z: 19.5),
        Vec2(x: 38.5, z: 13.0),
        Vec2(x: 53.0, z: 20.0)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xf3f6ff,
        pellicleSlimeHex: 0xe7b4f2,
        matureBiofilmHex: 0xa45cc7,
        gingivaHex: 0xe8687e,
        skyTopHex: 0x07071f,
        skyHorizonHex: 0x2a0f4f
    ),
    stephanSipIntervalSec: 22.0,
    challengeBlurb: "Every soda sip restarts the acid clock. Smash the sugar, hit Saliva springs, and fire Surge so it is safe to brush!"
)

/// World 4 — Accra Coastal Marathon Arch & 1901–1945 Colorado Springs / Grand Rapids Fluoride Trail ("Fluorapatite Coast").
public let world4FluorideFjord = WorldCartridge(
    id: "world_4",
    title: "Fluoride Coast",
    subtitle: "Accra & Colorado Springs Arch • Honoring Miswak & the Fluoride Discovery",
    hostId: "accra",
    historyNoteIds: ["1901_colorado_accra_miswak"],
    worldWidth: 64.0,
    worldDepth: 32.0,
    bChannelMode: .localPh,
    parTimeSec: 315.0,
    basePellicleDensity: 0.48,
    baselinePh: 6.55,
    probeSpawn: Vec2(x: 7.5, z: 16.0),
    districts: [
        DistrictDef(
            id: "accra_coastal_incisors",
            name: "Labadi Beach Front Teeth",
            subtitle: "Tart Splashes & Miswak Springs",
            bounds: AABB2D(minX: 2.5, minZ: 4.5, maxX: 22.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "miswak_fiber_contacts",
            name: "Miswak Gaps",
            subtitle: "Middle Gap Zip & Fluoride Armor",
            bounds: AABB2D(minX: 22.0, minZ: 4.5, maxX: 42.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "colorado_granite_molars",
            name: "Pikes Peak Fluoride Molars",
            subtitle: "Fluoride Shield Against Acid",
            bounds: AABB2D(minX: 42.0, minZ: 4.5, maxX: 61.5, maxZ: 27.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 3.0, minZ: 5.0, maxX: 22.0, maxZ: 27.0),
        AABB2D(minX: 22.0, minZ: 5.0, maxX: 42.0, maxZ: 27.0),
        AABB2D(minX: 42.0, minZ: 5.0, maxX: 61.0, maxZ: 27.0)
    ],
    wallBoxes: [
        AABB2D(minX: 20.59, minZ: 4.5, maxX: 23.41, maxZ: 12.6),
        AABB2D(minX: 20.59, minZ: 19.4, maxX: 23.41, maxZ: 27.5),
        AABB2D(minX: 40.59, minZ: 4.5, maxX: 43.41, maxZ: 7.1),
        AABB2D(minX: 40.59, minZ: 11.45, maxX: 43.41, maxZ: 20.55),
        AABB2D(minX: 40.59, minZ: 24.9, maxX: 43.41, maxZ: 27.5)
    ],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "alley_coastal_central",
            endpointA: Vec2(x: 20.2, z: 16.0),
            endpointB: Vec2(x: 23.8, z: 16.0),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_coastal_central"
        ),
        InterdentalAlleyDef(
            id: "alley_granite_north",
            endpointA: Vec2(x: 40.2, z: 10.5),
            endpointB: Vec2(x: 43.8, z: 10.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_granite_north"
        ),
        InterdentalAlleyDef(
            id: "alley_granite_south",
            endpointA: Vec2(x: 40.2, z: 21.5),
            endpointB: Vec2(x: 43.8, z: 21.5),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_granite_south"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 4.5, z: 25.8), b: Vec2(x: 19.0, z: 25.8), radius: 1.15, initialDensity: 0.82),
        Capsule2D(a: Vec2(x: 46.5, z: 16.0), b: Vec2(x: 58.5, z: 16.0), radius: 1.2, initialDensity: 0.85),
        Capsule2D(a: Vec2(x: 52.5, z: 9.5), b: Vec2(x: 52.5, z: 22.5), radius: 1.15, initialDensity: 0.85)
    ],
    heightCuspHills: [
        HillDef(cx: 12.0, cz: 16.0, radius: 10.5, height: 1.1),
        HillDef(cx: 28.0, cz: 10.0, radius: 5.2, height: 1.5),
        HillDef(cx: 28.0, cz: 22.0, radius: 5.2, height: 1.5),
        HillDef(cx: 36.0, cz: 10.0, radius: 5.2, height: 1.5),
        HillDef(cx: 36.0, cz: 22.0, radius: 5.2, height: 1.5),
        HillDef(cx: 48.0, cz: 9.8, radius: 6.0, height: 2.1),
        HillDef(cx: 57.0, cz: 9.8, radius: 6.0, height: 2.1),
        HillDef(cx: 48.0, cz: 22.2, radius: 6.0, height: 2.1),
        HillDef(cx: 57.0, cz: 22.2, radius: 6.0, height: 2.1)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "accra_d0_1", pos: Vec2(x: 8.5, z: 10.5), districtIdx: 0),
        CommensalSpawnDef(id: "accra_d0_2", pos: Vec2(x: 14.5, z: 11.5), districtIdx: 0),
        CommensalSpawnDef(id: "accra_d0_3", pos: Vec2(x: 15.5, z: 21.5), districtIdx: 0),
        CommensalSpawnDef(id: "accra_d1_1", pos: Vec2(x: 27.5, z: 20.5), districtIdx: 1),
        CommensalSpawnDef(id: "accra_d1_2", pos: Vec2(x: 32.0, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "accra_d1_3", pos: Vec2(x: 36.5, z: 10.5), districtIdx: 1),
        CommensalSpawnDef(id: "accra_d2_1", pos: Vec2(x: 48.5, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "accra_d2_2", pos: Vec2(x: 56.5, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "accra_d2_3", pos: Vec2(x: 48.5, z: 21.5), districtIdx: 2),
        CommensalSpawnDef(id: "accra_d2_4", pos: Vec2(x: 56.5, z: 21.5), districtIdx: 2)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "sobolo_c1", pos: Vec2(x: 16.5, z: 10.0), districtIdx: 0),
        SucroseSpawnDef(id: "sobolo_c2", pos: Vec2(x: 32.0, z: 9.5), districtIdx: 1),
        SucroseSpawnDef(id: "sobolo_c3", pos: Vec2(x: 55.5, z: 16.0), districtIdx: 2)
    ],
    biofilmBridges: [
        BridgeDef(id: "bridge_coastal_central", a: Vec2(x: 22.0, z: 15.3), b: Vec2(x: 22.0, z: 16.7), intact: true),
        BridgeDef(id: "bridge_granite_north", a: Vec2(x: 42.0, z: 9.8), b: Vec2(x: 42.0, z: 11.2), intact: true),
        BridgeDef(id: "bridge_granite_south", a: Vec2(x: 42.0, z: 20.8), b: Vec2(x: 42.0, z: 22.2), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 11.0, z: 20.5),
        Vec2(x: 27.5, z: 10.0),
        Vec2(x: 36.5, z: 22.0),
        Vec2(x: 48.0, z: 16.0)
    ],
    beaconDropSlots: [
        Vec2(x: 11.5, z: 13.5),
        Vec2(x: 28.0, z: 15.5),
        Vec2(x: 36.0, z: 16.5),
        Vec2(x: 53.5, z: 16.0)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xfffaf2,
        pellicleSlimeHex: 0xf4a261,
        matureBiofilmHex: 0xc8553d,
        gingivaHex: 0xd95b72,
        skyTopHex: 0x1c0b1e,
        skyHorizonHex: 0x6b1d3a
    ),
    erosionZones: [
        ErosionZoneDef(id: "hibiscus_basin_d0", cx: 14.0, cz: 11.5, radius: 4.4, targetPh: GameConfig.hibiscusErosionPh),
        ErosionZoneDef(id: "hibiscus_basin_d1", cx: 32.0, cz: 16.0, radius: 5.0, targetPh: GameConfig.hibiscusErosionPh),
        ErosionZoneDef(id: "hibiscus_basin_d2_n", cx: 52.0, cz: 11.0, radius: 4.6, targetPh: GameConfig.hibiscusErosionPh),
        ErosionZoneDef(id: "hibiscus_basin_d2_s", cx: 52.0, cz: 21.0, radius: 4.6, targetPh: GameConfig.hibiscusErosionPh)
    ],
    erosionPulseIntervalSec: 14.0,
    challengeBlurb: "Tart hibiscus splashes turn the pools acid! Touch a Miswak spring or fire Surge to add fluoride. Fluoride enamel stands up to acid."
)

/// World 5 — Station Aurora 408 km LEO ("Quorum Dome").
/// Honors NASA's 1973 Skylab oral microbiology studies & J.W. Costerton's 1978 EPS biofilm theory.
public let world5WisdomFrontier = WorldCartridge(
    id: "world_5",
    title: "Slime Dome",
    subtitle: "Station Aurora in Orbit • Honoring 1973 Skylab & 1978 Germ-Slime Science",
    hostId: "orbit_aurora",
    historyNoteIds: ["1973_skylab_orbit"],
    worldWidth: 64.0,
    worldDepth: 32.0,
    bChannelMode: .epsArmor,
    parTimeSec: 330.0,
    basePellicleDensity: 0.5,
    baselinePh: 6.85,
    probeSpawn: Vec2(x: 7.5, z: 16.0),
    districts: [
        DistrictDef(
            id: "cupola_incisor_deck",
            name: "Cupola Front-Tooth Deck",
            subtitle: "First Slime Dome & Floss Cut",
            bounds: AABB2D(minX: 2.5, minZ: 4.5, maxX: 22.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "airlock_premolar_truss",
            name: "Airlock Premolar Bridge",
            subtitle: "Space Floss Zips & Twin Slime Domes",
            bounds: AABB2D(minX: 22.0, minZ: 4.5, maxX: 42.0, maxZ: 27.5)
        ),
        DistrictDef(
            id: "skylab_molar_bioreactor",
            name: "Skylab Molar Lab",
            subtitle: "Big Slime Dome & Surge Blast",
            bounds: AABB2D(minX: 42.0, minZ: 4.5, maxX: 61.5, maxZ: 27.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 3.0, minZ: 5.0, maxX: 22.0, maxZ: 27.0),
        AABB2D(minX: 22.0, minZ: 5.0, maxX: 42.0, maxZ: 27.0),
        AABB2D(minX: 42.0, minZ: 5.0, maxX: 61.0, maxZ: 27.0)
    ],
    wallBoxes: [
        AABB2D(minX: 23.59, minZ: 4.5, maxX: 26.41, maxZ: 17.6),
        AABB2D(minX: 23.59, minZ: 24.4, maxX: 26.41, maxZ: 27.5),
        AABB2D(minX: 37.59, minZ: 4.5, maxX: 40.41, maxZ: 7.6),
        AABB2D(minX: 37.59, minZ: 14.4, maxX: 40.41, maxZ: 27.5)
    ],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "alley_airlock_south",
            endpointA: Vec2(x: 23.2, z: 21.0),
            endpointB: Vec2(x: 26.8, z: 21.0),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_airlock_south"
        ),
        InterdentalAlleyDef(
            id: "alley_airlock_north",
            endpointA: Vec2(x: 37.2, z: 11.0),
            endpointB: Vec2(x: 40.8, z: 11.0),
            width: 0.9,
            wallThickness: 2.95,
            bridgeId: "bridge_airlock_north"
        ),
        InterdentalAlleyDef(
            id: "alley_reactor_core",
            endpointA: Vec2(x: 48.3, z: 16.0),
            endpointB: Vec2(x: 51.7, z: 16.0),
            width: 0.9,
            wallThickness: 1.8,
            bridgeId: "bridge_reactor_core"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 4.5, z: 6.0), b: Vec2(x: 20.5, z: 6.0), radius: 1.15, initialDensity: 0.82),
        Capsule2D(a: Vec2(x: 44.5, z: 25.8), b: Vec2(x: 59.5, z: 25.8), radius: 1.2, initialDensity: 0.85),
        Capsule2D(a: Vec2(x: 54.5, z: 9.5), b: Vec2(x: 54.5, z: 22.5), radius: 1.2, initialDensity: 0.86)
    ],
    heightCuspHills: [
        HillDef(cx: 12.5, cz: 16.0, radius: 10.5, height: 1.2),
        HillDef(cx: 30.0, cz: 10.0, radius: 5.0, height: 1.5),
        HillDef(cx: 30.0, cz: 22.0, radius: 5.0, height: 1.5),
        HillDef(cx: 35.0, cz: 10.0, radius: 4.6, height: 1.4),
        HillDef(cx: 35.0, cz: 22.0, radius: 4.6, height: 1.4),
        HillDef(cx: 47.0, cz: 9.8, radius: 6.0, height: 2.2),
        HillDef(cx: 57.5, cz: 9.8, radius: 6.2, height: 2.3),
        HillDef(cx: 47.0, cz: 22.2, radius: 6.0, height: 2.2),
        HillDef(cx: 57.5, cz: 22.2, radius: 6.2, height: 2.3)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "aurora_d0_1", pos: Vec2(x: 9.5, z: 10.5), districtIdx: 0),
        CommensalSpawnDef(id: "aurora_d0_2", pos: Vec2(x: 15.5, z: 16.0), districtIdx: 0),
        CommensalSpawnDef(id: "aurora_d0_3", pos: Vec2(x: 14.0, z: 22.5), districtIdx: 0),
        CommensalSpawnDef(id: "aurora_d1_1", pos: Vec2(x: 31.5, z: 10.5), districtIdx: 1),
        CommensalSpawnDef(id: "aurora_d1_2", pos: Vec2(x: 32.0, z: 16.0), districtIdx: 1),
        CommensalSpawnDef(id: "aurora_d1_3", pos: Vec2(x: 32.5, z: 21.5), districtIdx: 1),
        CommensalSpawnDef(id: "aurora_d2_1", pos: Vec2(x: 45.5, z: 10.5), districtIdx: 2),
        CommensalSpawnDef(id: "aurora_d2_2", pos: Vec2(x: 45.5, z: 21.5), districtIdx: 2),
        CommensalSpawnDef(id: "aurora_d2_3", pos: Vec2(x: 55.0, z: 16.0), districtIdx: 2),
        CommensalSpawnDef(id: "aurora_d2_4", pos: Vec2(x: 57.5, z: 10.5), districtIdx: 2)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "berry_bar_1", pos: Vec2(x: 18.5, z: 10.0), districtIdx: 0),
        SucroseSpawnDef(id: "berry_bar_2", pos: Vec2(x: 29.5, z: 22.0), districtIdx: 1),
        SucroseSpawnDef(id: "berry_bar_3", pos: Vec2(x: 34.5, z: 10.0), districtIdx: 1),
        SucroseSpawnDef(id: "berry_bar_4", pos: Vec2(x: 57.5, z: 21.5), districtIdx: 2)
    ],
    biofilmBridges: [
        BridgeDef(id: "bridge_airlock_south", a: Vec2(x: 25.0, z: 20.3), b: Vec2(x: 25.0, z: 21.7), intact: true),
        BridgeDef(id: "bridge_airlock_north", a: Vec2(x: 39.0, z: 10.3), b: Vec2(x: 39.0, z: 11.7), intact: true),
        BridgeDef(id: "bridge_reactor_core", a: Vec2(x: 50.0, z: 15.3), b: Vec2(x: 50.0, z: 16.7), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 11.0, z: 21.0),
        Vec2(x: 29.0, z: 14.0),
        Vec2(x: 45.0, z: 16.0),
        Vec2(x: 53.5, z: 10.0)
    ],
    beaconDropSlots: [
        Vec2(x: 11.5, z: 12.5),
        Vec2(x: 29.5, z: 19.0),
        Vec2(x: 35.0, z: 16.0),
        Vec2(x: 53.5, z: 22.0)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xf2f9ff,
        pellicleSlimeHex: 0x6ee7b7,
        matureBiofilmHex: 0x059669,
        gingivaHex: 0xd9607b,
        skyTopHex: 0x030712,
        skyHorizonHex: 0x063940
    ),
    epsDomes: [
        EpsDomeDef(id: "dome_cupola_d0", cx: 15.5, cz: 16.0, radius: 3.1, initialDensity: 0.86),
        EpsDomeDef(id: "dome_truss_d1_n", cx: 31.5, cz: 10.5, radius: 2.9, initialDensity: 0.86),
        EpsDomeDef(id: "dome_truss_d1_s", cx: 32.5, cz: 21.5, radius: 2.9, initialDensity: 0.86),
        EpsDomeDef(id: "dome_reactor_d2", cx: 55.0, cz: 16.0, radius: 3.6, initialDensity: 0.9)
    ],
    challengeBlurb: "In space, slime domes block the brush! Cut them open with Floss or blast them with Surge, then sweep clean."
)

/// Compact 32u x 32u single-molar emergency cartridge for the 90s Pulp Rescue Scramble ("Avoid the Dreaded Root Canal!" — zero permadeath on timeout).
public let pulpRescueStage = WorldCartridge(
    id: "pulp_rescue",
    title: "Emergency Pulp Rescue!",
    subtitle: "Clean the Deep Groove & Seal It to Protect the Pulp!",
    hostId: "toronto",
    historyNoteIds: [],
    worldWidth: 32.0,
    worldDepth: 32.0,
    bChannelMode: .localPh,
    parTimeSec: 90.0,
    basePellicleDensity: 0.56,
    baselinePh: 6.4,
    probeSpawn: Vec2(x: 8.0, z: 16.0),
    districts: [
        DistrictDef(
            id: "deep_pulp_crown",
            name: "Deep Tooth Bowl",
            subtitle: "Smash Sugar, Stop Acid & Seal 85%!",
            bounds: AABB2D(minX: 3.5, minZ: 3.5, maxX: 28.5, maxZ: 28.5)
        )
    ],
    playableMaskBoxes: [
        AABB2D(minX: 4.0, minZ: 4.0, maxX: 28.0, maxZ: 28.0)
    ],
    wallBoxes: [],
    interdentalAlleys: [
        InterdentalAlleyDef(
            id: "rescue_fissure_vent",
            endpointA: Vec2(x: 14.2, z: 16.0),
            endpointB: Vec2(x: 17.8, z: 16.0),
            width: 0.9,
            wallThickness: 1.5,
            bridgeId: "rescue_bridge"
        )
    ],
    marginBands: [
        Capsule2D(a: Vec2(x: 6.0, z: 16.0), b: Vec2(x: 26.0, z: 16.0), radius: 1.5, initialDensity: 0.88),
        Capsule2D(a: Vec2(x: 16.0, z: 6.0), b: Vec2(x: 16.0, z: 26.0), radius: 1.5, initialDensity: 0.88)
    ],
    heightCuspHills: [
        HillDef(cx: 9.5, cz: 9.5, radius: 6.5, height: 2.2),
        HillDef(cx: 22.5, cz: 9.5, radius: 6.5, height: 2.2),
        HillDef(cx: 9.5, cz: 22.5, radius: 6.5, height: 2.2),
        HillDef(cx: 22.5, cz: 22.5, radius: 6.5, height: 2.2)
    ],
    commensalSiteSpawns: [
        CommensalSpawnDef(id: "rescue_site_1", pos: Vec2(x: 10.0, z: 10.0), districtIdx: 0),
        CommensalSpawnDef(id: "rescue_site_2", pos: Vec2(x: 22.0, z: 10.0), districtIdx: 0),
        CommensalSpawnDef(id: "rescue_site_3", pos: Vec2(x: 22.0, z: 22.0), districtIdx: 0)
    ],
    sucroseSpawns: [
        SucroseSpawnDef(id: "rescue_suc_1", pos: Vec2(x: 16.0, z: 10.0), districtIdx: 0),
        SucroseSpawnDef(id: "rescue_suc_2", pos: Vec2(x: 16.0, z: 22.0), districtIdx: 0)
    ],
    biofilmBridges: [
        BridgeDef(id: "rescue_bridge", a: Vec2(x: 16.0, z: 15.2), b: Vec2(x: 16.0, z: 16.8), intact: true)
    ],
    salivaSprings: [
        Vec2(x: 10.0, z: 22.0),
        Vec2(x: 24.0, z: 16.0)
    ],
    beaconDropSlots: [
        Vec2(x: 12.0, z: 16.0)
    ],
    palette: WorldVisualPalette(
        enamelBaseHex: 0xfff5f0,
        pellicleSlimeHex: 0xe69d38,
        matureBiofilmHex: 0xc4512d,
        gingivaHex: 0xd94862,
        skyTopHex: 0x1f0812,
        skyHorizonHex: 0x4a1228
    ),
    challengeBlurb: "90 seconds: hit Saliva Springs, smash Sugar Crystals, and clean 85% before time runs out. You can’t lose the tooth!"
)

// TypeScript Golden Master cartridge aliases
public let plaqueCityCartridge = world1AnteriorIncisors
public let crescentSulcusCartridge = world2PremolarAlley
public let neonAcidClockCartridge = world3FirstMolarCitadel
public let fluorapatiteCoastCartridge = world4FluorideFjord
public let orbitalBiofilmDomeCartridge = world5WisdomFrontier
public let pulpRescueCartridge = pulpRescueStage

public enum WorldRegistry {
    public static let world1 = world1AnteriorIncisors
    public static let world2 = world2PremolarAlley
    public static let world3 = world3FirstMolarCitadel
    public static let world4 = world4FluorideFjord
    public static let world5 = world5WisdomFrontier
    public static let pulpRescue = pulpRescueStage

    public static let campaignWorlds: [WorldCartridge] = [
        world1AnteriorIncisors,
        world2PremolarAlley,
        world3FirstMolarCitadel,
        world4FluorideFjord,
        world5WisdomFrontier
    ]

    public static let campaignWorldIds: [String] = campaignWorlds.map(\.id)

    public static let allWorlds: [WorldCartridge] = [
        world1AnteriorIncisors,
        world2PremolarAlley,
        world3FirstMolarCitadel,
        world4FluorideFjord,
        world5WisdomFrontier,
        pulpRescueStage
    ]

    public static let byId: [String: WorldCartridge] = Dictionary(
        uniqueKeysWithValues: allWorlds.map { ($0.id, $0) }
    )

    public static func isPlayableWorld(_ id: String) -> Bool {
        byId[id] != nil
    }

    public static func cartridge(forId id: String) -> WorldCartridge? {
        byId[id]
    }

    public static func cartridgeOrDefault(forId id: String) -> WorldCartridge {
        byId[id] ?? world1AnteriorIncisors
    }

    public static func nextWorldId(after worldId: String) -> String? {
        guard let idx = campaignWorldIds.firstIndex(of: worldId),
              idx + 1 < campaignWorldIds.count
        else {
            return nil
        }
        return campaignWorldIds[idx + 1]
    }
}
