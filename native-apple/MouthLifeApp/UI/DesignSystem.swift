import SwiftUI

public enum MLTheme {
    public static let deepOcean = Color(red: 0.016, green: 0.063, blue: 0.110)     // #04101c
    public static let cardBg = Color(red: 0.035, green: 0.115, blue: 0.195).opacity(0.84)
    public static let cardElevated = Color(red: 0.055, green: 0.155, blue: 0.255).opacity(0.90)
    public static let cyanAccent = Color(red: 0.220, green: 0.890, blue: 0.941)    // #38e3f0
    public static let mintClean = Color(red: 0.240, green: 0.930, blue: 0.720)     // #3dedb8
    public static let fluorapatiteGold = Color(red: 0.985, green: 0.805, blue: 0.290)
    public static let coralGum = Color(red: 0.925, green: 0.465, blue: 0.565)
    public static let sucroseViolet = Color(red: 0.780, green: 0.440, blue: 0.980)
    public static let discloseMagenta = Color(red: 1.000, green: 0.240, blue: 0.680)
    public static let amberWarn = Color(red: 0.990, green: 0.690, blue: 0.240)
    public static let textPrimary = Color(red: 0.945, green: 0.975, blue: 1.000)
    public static let textSecondary = Color(red: 0.665, green: 0.795, blue: 0.890)
    public static let textMuted = Color(red: 0.460, green: 0.600, blue: 0.710)

    public static func color(hexString: String) -> Color {
        let trimmed = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: trimmed).scanHexInt64(&int)
        let r, g, b: Double
        switch trimmed.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255.0
            g = Double((int >> 8) & 0xFF) / 255.0
            b = Double(int & 0xFF) / 255.0
        default:
            r = 0.5; g = 0.7; b = 0.9
        }
        return Color(red: r, green: g, blue: b)
    }

    public static func color(hex: UInt32) -> Color {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        return Color(red: r, green: g, blue: b)
    }
}

public struct MLGlassCard: ViewModifier {
    public var cornerRadius: CGFloat = 20
    public var borderColor: Color = MLTheme.cyanAccent.opacity(0.32)
    public var padding: CGFloat = 14

    public func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(MLTheme.cardBg)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1.1)
            )
            .shadow(color: Color.black.opacity(0.36), radius: 16, x: 0, y: 8)
    }
}

extension View {
    public func mlGlassCard(
        cornerRadius: CGFloat = 20,
        borderColor: Color = MLTheme.cyanAccent.opacity(0.32),
        padding: CGFloat = 14
    ) -> some View {
        modifier(MLGlassCard(cornerRadius: cornerRadius, borderColor: borderColor, padding: padding))
    }
}

public struct MLPrimaryButtonStyle: ButtonStyle {
    public var accent: Color = MLTheme.cyanAccent
    public var darkText: Bool = true

    public init(accent: Color = MLTheme.cyanAccent, darkText: Bool = true) {
        self.accent = accent
        self.darkText = darkText
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .rounded, weight: .bold))
            .foregroundStyle(darkText ? MLTheme.deepOcean : .white)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                Capsule(style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.80)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(Color.white.opacity(0.35), lineWidth: 1)
            )
            .shadow(color: accent.opacity(configuration.isPressed ? 0.18 : 0.42), radius: 12, x: 0, y: 4)
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.spring(response: 0.22, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

public struct MLGlassPillButtonStyle: ButtonStyle {
    public var tint: Color = MLTheme.cyanAccent

    public init(tint: Color = MLTheme.cyanAccent) {
        self.tint = tint
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.footnote, design: .rounded, weight: .semibold))
            .foregroundStyle(MLTheme.textPrimary)
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(
                Capsule(style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule(style: .continuous)
                            .fill(MLTheme.cardBg)
                    )
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(tint.opacity(0.42), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.20, dampingFraction: 0.74), value: configuration.isPressed)
    }
}

public struct MLStatChip: View {
    public let icon: String
    public let label: String
    public let value: String
    public let tint: Color

    public init(icon: String, label: String, value: String, tint: Color = MLTheme.cyanAccent) {
        self.icon = icon
        self.label = label
        self.value = value
        self.tint = tint
    }

    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(MLTheme.textMuted)
                Text(value)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(MLTheme.textPrimary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule(style: .continuous)
                .fill(MLTheme.cardBg)
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(tint.opacity(0.32), lineWidth: 1)
        )
    }
}

public struct MLShieldBar: View {
    public let label: String
    public let value: Double // 0..100
    public let tint: Color

    public init(label: String, value: Double, tint: Color) {
        self.label = label
        self.value = value
        self.tint = tint
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                Spacer()
                Text("\(Int(value.rounded()))%")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.10))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [tint.opacity(0.80), tint],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(4, geo.size.width * CGFloat(min(max(value / 100.0, 0), 1))))
                }
            }
            .frame(height: 6)
        }
    }
}
