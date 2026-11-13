import SwiftUI
import MouthLifeCore

public struct UpgradeLabSheet: View {
    @Environment(\.dismiss) private var dismiss

    public let fluorideIons: Int
    public let totalBrushStamps: Int
    public let unlockedUpgrades: Set<String>
    public let equippedUpgrades: EquippedUpgrades
    public let onPurchase: (String) -> Void
    public let onEquipToggle: (ActuatorKind, String?) -> Void

    public init(
        fluorideIons: Int,
        totalBrushStamps: Int,
        unlockedUpgrades: Set<String>,
        equippedUpgrades: EquippedUpgrades,
        onPurchase: @escaping (String) -> Void,
        onEquipToggle: @escaping (ActuatorKind, String?) -> Void
    ) {
        self.fluorideIons = fluorideIons
        self.totalBrushStamps = totalBrushStamps
        self.unlockedUpgrades = unlockedUpgrades
        self.equippedUpgrades = equippedUpgrades
        self.onPurchase = onPurchase
        self.onEquipToggle = onEquipToggle
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Balance Bar
                    HStack(spacing: 10) {
                        MLStatChip(
                            icon: "bolt.shield.fill",
                            label: "Fluoride Ions",
                            value: "\(fluorideIons) F⁻",
                            tint: MLTheme.cyanAccent
                        )
                        MLStatChip(
                            icon: "checkmark.seal.fill",
                            label: "Habit Stamps",
                            value: "\(totalBrushStamps)",
                            tint: MLTheme.mintClean
                        )
                        Spacer()
                    }

                    Text("Every upgrade unlocks automatically through real-life Brush-Along Habit Stamps or campaign clears — or immediately using Fluoride Ions.")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)

                    ForEach(ActuatorKind.allCases, id: \.rawValue) { slot in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Label(slotTitle(slot), systemImage: slotIcon(slot))
                                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                                    .foregroundStyle(MLTheme.cyanAccent)
                                Spacer()
                                if equippedUpgrades[slot] != nil {
                                    Button("Use Standard") {
                                        onEquipToggle(slot, nil)
                                    }
                                    .font(.system(.caption2, design: .rounded, weight: .bold))
                                    .foregroundStyle(MLTheme.textSecondary)
                                }
                            }

                            ForEach(UpgradeCatalog.upgrades(for: slot)) { upg in
                                let isUnlocked = unlockedUpgrades.contains(upg.id)
                                let isEquipped = equippedUpgrades[slot] == upg.id
                                let canAfford = fluorideIons >= upg.ionCost

                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(upg.name)
                                                .font(.system(.headline, design: .rounded, weight: .bold))
                                                .foregroundStyle(MLTheme.textPrimary)
                                            Text(upg.tagline)
                                                .font(.system(.footnote, design: .rounded, weight: .semibold))
                                                .foregroundStyle(MLTheme.mintClean)
                                        }
                                        Spacer()
                                        if isEquipped {
                                            Text("EQUIPPED")
                                                .font(.system(size: 10, weight: .heavy, design: .rounded))
                                                .foregroundStyle(MLTheme.deepOcean)
                                                .padding(.horizontal, 9)
                                                .padding(.vertical, 4)
                                                .background(Capsule().fill(MLTheme.fluorapatiteGold))
                                        }
                                    }

                                    Text(upg.scientificNote)
                                        .font(.system(.caption, design: .rounded))
                                        .foregroundStyle(MLTheme.textSecondary)

                                    HStack {
                                        if let stamps = upg.stampUnlockThreshold {
                                            Text("Auto: \(stamps) Stamps")
                                                .font(.system(.caption2, design: .rounded, weight: .semibold))
                                                .foregroundStyle(MLTheme.textMuted)
                                        }
                                        if let worldId = upg.worldClearUnlockId {
                                            Text("• or Clear \(worldId.replacingOccurrences(of: "_", with: " ").capitalized)")
                                                .font(.system(.caption2, design: .rounded, weight: .semibold))
                                                .foregroundStyle(MLTheme.textMuted)
                                        }
                                        Spacer()

                                        if isUnlocked {
                                            Button(isEquipped ? "Unequip" : "Equip") {
                                                onEquipToggle(slot, isEquipped ? nil : upg.id)
                                            }
                                            .buttonStyle(
                                                MLPrimaryButtonStyle(
                                                    accent: isEquipped ? MLTheme.textSecondary : MLTheme.cyanAccent,
                                                    darkText: true
                                                )
                                            )
                                        } else {
                                            Button {
                                                onPurchase(upg.id)
                                            } label: {
                                                Label("\(upg.ionCost) F⁻", systemImage: canAfford ? "lock.open.fill" : "lock.fill")
                                            }
                                            .buttonStyle(
                                                MLPrimaryButtonStyle(
                                                    accent: canAfford ? MLTheme.fluorapatiteGold : MLTheme.textMuted,
                                                    darkText: true
                                                )
                                            )
                                            .disabled(!canAfford)
                                        }
                                    }
                                }
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .fill(Color.white.opacity(isEquipped ? 0.09 : 0.04))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .strokeBorder(
                                            isEquipped ? MLTheme.fluorapatiteGold.opacity(0.65) : Color.white.opacity(0.10),
                                            lineWidth: 1.1
                                        )
                                )
                            }
                        }
                        .mlGlassCard()
                    }
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle("HYDRA-1 Upgrade Lab")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(MLTheme.cyanAccent)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func slotTitle(_ slot: ActuatorKind) -> String {
        switch slot {
        case .brush: return "SONIC BRISTLE ARRAY"
        case .floss: return "POLYMER FLOSS FILAMENT"
        case .rinse: return "ION RINSE INFUSER"
        }
    }

    private func slotIcon(_ slot: ActuatorKind) -> String {
        switch slot {
        case .brush: return "waveform.circle.fill"
        case .floss: return "line.diagonal.arrow"
        case .rinse: return "drop.circle.fill"
        }
    }
}
