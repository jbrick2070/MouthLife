import Foundation

public enum UpgradeCatalog {
    public static let all: [UpgradeDef] = [
        UpgradeDef(
            id: "angled_bass_array",
            slot: .brush,
            name: "45° Angled Bass Bristle Array",
            tagline: "Widens sweep arc (95° → 130°) & boosts gumline/fissure shear +45%.",
            scientificNote: "Pioneered by Dr. Charles C. Bass at Tulane University (1948): angling soft filaments 45° into the gingival margin disrupts stubborn cervical plaque.",
            stampUnlockThreshold: 3,
            worldClearUnlockId: "world_1",
            ionCost: 100
        ),
        UpgradeDef(
            id: "hydro_sonic_pulse",
            slot: .brush,
            name: "Hydro-Sonic Acoustic Streaming",
            tagline: "Extends brush reach +16% (115° arc, +30% fissure shear) & halves sulcus gum pressure.",
            scientificNote: "High-frequency bristle oscillation creates micro-bubbles and fluid shear forces slightly beyond physical filament tips without abrading soft tissue.",
            stampUnlockThreshold: 6,
            worldClearUnlockId: "world_2",
            ionCost: 250
        ),
        UpgradeDef(
            id: "ptfe_ribbon_filament",
            slot: .floss,
            name: "Woven C-Contour Ribbon Filament",
            tagline: "Widens interproximal shear swath +50% & boosts Surge charge +25%.",
            scientificNote: "Wrapping broad filament in a C-shape around each proximal tooth contour clears the full convex contact area rather than snapping straight into the papilla.",
            stampUnlockThreshold: 10,
            worldClearUnlockId: "world_3",
            ionCost: 400
        ),
        UpgradeDef(
            id: "bicarb_buffer_jet",
            slot: .rinse,
            name: "Salivary Bicarbonate + F⁻ Infusion",
            tagline: "Ion Rinse buffers nearby enamel to pH 7.2.",
            scientificNote: "Salivary bicarbonate (HCO₃⁻) neutralizes bacterial lactic acid so calcium, phosphate, and fluoride ions can re-precipitate into fluorapatite.",
            stampUnlockThreshold: 15,
            worldClearUnlockId: "world_4",
            ionCost: 600
        )
    ]

    public static let ids: Set<String> = Set(all.map(\.id))

    public static func get(_ id: String) -> UpgradeDef? {
        all.first { $0.id == id }
    }

    public static func get(_ id: String?) -> UpgradeDef? {
        guard let id else { return nil }
        return get(id)
    }

    public static func upgrades(for slot: ActuatorKind) -> [UpgradeDef] {
        all.filter { $0.slot == slot }
    }
}
