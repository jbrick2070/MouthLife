import SwiftUI
import MouthLifeCore

public struct ProfileAndSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var displayName: String
    @State private var skinToneIndex: Int
    @State private var homeCityId: String
    @State private var qualityPref: QualityPreference
    @State private var isMuted: Bool
    @State private var musicVolume: Double
    @State private var sfxVolume: Double
    @State private var voiceCoachEnabled: Bool
    @State private var coachLanguage: CoachLanguage
    @State private var reducedMotion: Bool
    @State private var showProMotionTelemetry: Bool

    public let onSaveProfile: (String, Int, String) -> Void
    public let onChangeQuality: (QualityPreference) -> Void
    public let onChangeAudio: (Bool, Float, Float) -> Void
    public let onChangeVoiceCoach: (Bool) -> Void
    public let onChangeLanguage: (CoachLanguage) -> Void
    public let onChangeReducedMotion: (Bool) -> Void
    public let onToggleProMotionTelemetry: (Bool) -> Void
    public let onReplayCosmicIntro: () -> Void

    public init(
        profile: PlayerHostProfile,
        qualityPref: QualityPreference,
        isMuted: Bool,
        musicVolume: Float,
        sfxVolume: Float,
        voiceCoachEnabled: Bool = true,
        coachLanguage: CoachLanguage = .english,
        reducedMotion: Bool,
        showProMotionTelemetry: Bool,
        onSaveProfile: @escaping (String, Int, String) -> Void,
        onChangeQuality: @escaping (QualityPreference) -> Void,
        onChangeAudio: @escaping (Bool, Float, Float) -> Void,
        onChangeVoiceCoach: @escaping (Bool) -> Void = { _ in },
        onChangeLanguage: @escaping (CoachLanguage) -> Void = { _ in },
        onChangeReducedMotion: @escaping (Bool) -> Void,
        onToggleProMotionTelemetry: @escaping (Bool) -> Void,
        onReplayCosmicIntro: @escaping () -> Void
    ) {
        _displayName = State(initialValue: profile.displayName)
        _skinToneIndex = State(initialValue: profile.skinToneIndex)
        _homeCityId = State(initialValue: profile.homeCityId)
        _qualityPref = State(initialValue: qualityPref)
        _isMuted = State(initialValue: isMuted)
        _musicVolume = State(initialValue: Double(musicVolume))
        _sfxVolume = State(initialValue: Double(sfxVolume))
        _voiceCoachEnabled = State(initialValue: voiceCoachEnabled)
        _coachLanguage = State(initialValue: coachLanguage)
        _reducedMotion = State(initialValue: reducedMotion)
        _showProMotionTelemetry = State(initialValue: showProMotionTelemetry)
        self.onSaveProfile = onSaveProfile
        self.onChangeQuality = onChangeQuality
        self.onChangeAudio = onChangeAudio
        self.onChangeVoiceCoach = onChangeVoiceCoach
        self.onChangeLanguage = onChangeLanguage
        self.onChangeReducedMotion = onChangeReducedMotion
        self.onToggleProMotionTelemetry = onToggleProMotionTelemetry
        self.onReplayCosmicIntro = onReplayCosmicIntro
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Host Profile Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L10n.t("HOST PROFILE"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        TextField(L10n.t("Display Name"), text: $displayName)
                            .textFieldStyle(.plain)
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textPrimary)
                            .padding(11)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.07)))
                            .onChange(of: displayName) { _, newValue in
                                onSaveProfile(newValue, skinToneIndex, homeCityId)
                            }

                        Text(L10n.t("Skin Tone Swatch"))
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)

                        HStack(spacing: 10) {
                            ForEach(HostsAndHistory.skinToneSwatches) { swatch in
                                let selected = skinToneIndex == swatch.index
                                Button {
                                    skinToneIndex = swatch.index
                                    onSaveProfile(displayName, swatch.index, homeCityId)
                                } label: {
                                    Circle()
                                        .fill(MLTheme.color(hexString: swatch.hex))
                                        .frame(width: 30, height: 30)
                                        .overlay(
                                            Circle()
                                                .strokeBorder(selected ? MLTheme.cyanAccent : Color.white.opacity(0.25), lineWidth: selected ? 3 : 1)
                                        )
                                }
                                .accessibilityLabel(L10n.t(swatch.label))
                            }
                        }

                        Text(L10n.t("Home City"))
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(HostsAndHistory.hostCities) { city in
                                    let active = homeCityId == city.id
                                    Button {
                                        homeCityId = city.id
                                        onSaveProfile(displayName, skinToneIndex, city.id)
                                    } label: {
                                        Text(L10n.t("\(city.signatureTreat.emoji) \(city.city)"))
                                            .font(.system(.caption, design: .rounded, weight: .bold))
                                            .foregroundStyle(active ? MLTheme.deepOcean : MLTheme.textPrimary)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 7)
                                            .background(
                                                Capsule().fill(active ? MLTheme.cyanAccent : Color.white.opacity(0.08))
                                            )
                                    }
                                }
                            }
                        }
                    }
                    .mlGlassCard()

                    // Comfort card. Graphics quality is chosen automatically, as players expect on a
                    // phone: the app watches its own frame rate and adjusts without asking.
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(L10n.t("Less Camera Motion"), isOn: $reducedMotion)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.cyanAccent)
                            .onChange(of: reducedMotion) { _, next in
                                onChangeReducedMotion(next)
                            }
                    }
                    .mlGlassCard()

                    // Hands-Free Multilingual Voice Coach Card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(L10n.t("HANDS-FREE VOICE & LANGUAGE"))
                                .font(.system(.caption, design: .rounded, weight: .bold))
                                .foregroundStyle(MLTheme.cyanAccent)
                            Spacer()
                            Text(L10n.t("\(coachLanguage.flagEmoji) \(coachLanguage.nativeName)"))
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundStyle(MLTheme.mintClean)
                        }

                        Toggle(L10n.t("Spoken Brushing Coach"), isOn: $voiceCoachEnabled)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.mintClean)
                            .onChange(of: voiceCoachEnabled) { _, next in
                                onChangeVoiceCoach(next)
                            }

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(CoachLanguage.allCases) { lang in
                                    let active = (coachLanguage == lang)
                                    Button {
                                        coachLanguage = lang
                                        onChangeLanguage(lang)
                                    } label: {
                                        Text(L10n.t("\(lang.flagEmoji) \(lang.nativeName)"))
                                            .font(.system(.caption, design: .rounded, weight: .bold))
                                            .foregroundStyle(active ? MLTheme.deepOcean : MLTheme.textPrimary)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 7)
                                            .background(
                                                Capsule().fill(active ? MLTheme.mintClean : Color.white.opacity(0.08))
                                            )
                                    }
                                }
                            }
                        }
                    }
                    .mlGlassCard()

                    // Procedural Audio Synthesizer Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L10n.t("PROCEDURAL AVAUDIOENGINE SYNTH"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        Toggle(L10n.t("Mute All Game Audio"), isOn: $isMuted)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.coralGum)
                            .onChange(of: isMuted) { _, next in
                                onChangeAudio(next, Float(musicVolume), Float(sfxVolume))
                            }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(L10n.t("Adaptive Music"))
                                Spacer()
                                Text(L10n.t("\(Int((musicVolume * 100).rounded()))%"))
                                    .monospacedDigit()
                            }
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)

                            Slider(value: $musicVolume, in: 0...1)
                                .tint(MLTheme.cyanAccent)
                                .onChange(of: musicVolume) { _, next in
                                    onChangeAudio(isMuted, Float(next), Float(sfxVolume))
                                }
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(L10n.t("ASMR Scrub & Glass-Harp SFX"))
                                Spacer()
                                Text(L10n.t("\(Int((sfxVolume * 100).rounded()))%"))
                                    .monospacedDigit()
                            }
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)

                            Slider(value: $sfxVolume, in: 0...1)
                                .tint(MLTheme.mintClean)
                                .onChange(of: sfxVolume) { _, next in
                                    onChangeAudio(isMuted, Float(musicVolume), Float(next))
                                }
                        }
                    }
                    .mlGlassCard()

                    // Replay Cosmic Intro + Privacy & Disclaimer
                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            dismiss()
                            onReplayCosmicIntro()
                        } label: {
                            Label(L10n.t("Replay the Star Story Intro"), systemImage: "sparkles.tv.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))

                        Text(L10n.t("Stays on your device • No tracking • No ads"))
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.mintClean)

                        Text(L10n.t(CharityInfo.clinicalDisclaimer))
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: Color.white.opacity(0.14))
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("Profile & Settings"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("Done")) { dismiss() }
                        .foregroundStyle(MLTheme.cyanAccent)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}
