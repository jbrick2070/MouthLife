import Foundation

/// The Prologue's hardness comparison: five specimens, softest first, in the same order as the 3D
/// crystals (`ProceduralMeshBuilder.buildMohsSpecimensLineup`). Web twin: `MOHS_SPECIMENS` in
/// `src/ui/CosmicIntroOverlay.ts` (same words, so both editions share one translation).
public struct MohsSpecimen: Equatable, Sendable {
    public let hardness: String
    public let name: String
    /// Written as is in every language.
    public let formula: String
    public let note: String
    public let isEnamel: Bool
}

public enum MohsSpecimens {
    public static let all: [MohsSpecimen] = [
        MohsSpecimen(
            hardness: "2.5",
            name: "Pure Gold",
            formula: "Au",
            note: "Gold is a soft metal. Your tooth enamel can scratch it easily!",
            isEnamel: false
        ),
        MohsSpecimen(
            hardness: "4.0",
            name: "Iron / Mild Steel",
            formula: "Fe",
            note: "Iron and nails are softer than tooth enamel. Yes, your teeth are harder than iron!",
            isEnamel: false
        ),
        MohsSpecimen(
            hardness: "5.0",
            name: "Tooth Enamel",
            formula: "Ca₁₀(PO₄)₆(OH)₂",
            note: "Enamel is almost all crystal. It is the hardest thing in your whole body!",
            isEnamel: true
        ),
        MohsSpecimen(
            hardness: "7.0",
            name: "Crystalline Quartz",
            formula: "SiO₂",
            note: "Quartz is harder than enamel. That is why toothpaste grit must be very fine and round.",
            isEnamel: false
        ),
        MohsSpecimen(
            hardness: "10.0",
            name: "Diamond",
            formula: "C (sp³)",
            note: "Diamond is the hardest crystal of all. Enamel sits about halfway up the scale!",
            isEnamel: false
        ),
    ]

    /// The Prologue starts on enamel, as on the web.
    public static let enamelIndex = 2
}
