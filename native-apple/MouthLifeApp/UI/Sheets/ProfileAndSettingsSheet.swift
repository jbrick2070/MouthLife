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
    @State private var reducedMotion: Bool
    @State private var showProMotionTelemetry: Bool

    public let onSaveProfile: (String, Int, String) -> Void
    public let onChangeQuality: (QualityPreference) -> Void
    public let onChangeAudio: (Bool, Float, Float) -> Void
    public let onChangeReducedMotion: (Bool) -> Void
    public let onToggleProMotionTelemetry: (Bool) -> Void
    public let onReplayCosmicIntro: () -> Void

    public init(
        profile: PlayerHostProfile,
        qualityPref: QualityPreference,
        isMuted: Bool,
        musicVolume: Float,
        sfxVolume: Float,
        reducedMotion: Bool,
        showProMotionTelemetry: Bool,
        onSaveProfile: @escaping (String, Int, String) -> Void,
        onChangeQuality: @escaping (QualityPreference) -> Void,
        onChangeAudio: @escaping (Bool, Float, Float) -> Void,
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
        _reducedMotion = State(initialValue: reducedMotion)
        _showProMotionTelemetry = State(initialValue: showProMotionTelemetry)
        self.onSaveProfile = onSaveProfile
        self.onChangeQuality = onChangeQuality
        self.onChangeAudio = onChangeAudio
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
                        Text("HOST PROFILE")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        TextField("Display Name", text: $displayName)
                            .textFieldStyle(.plain)
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textPrimary)
                            .padding(11)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.07)))
                            .onChange(of: displayName) { _, newValue in
                                onSaveProfile(newValue, skinToneIndex, homeCityId)
                            }

                        Text("Skin Tone Swatch")
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
                                .accessibilityLabel(swatch.label)
                            }
                        }

                        Text("Home City Beacon")
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
                                        Text("\(city.signatureTreat.emoji) \(city.city)")
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

                    // 120Hz ProMotion & GPU Quality Card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("120Hz PROMOTION & METAL GPU")
                                .font(.system(.caption, design: .rounded, weight: .bold))
                                .foregroundStyle(MLTheme.cyanAccent)
                            Spacer()
                            Text("NATIVE METAL")
                                .font(.system(size: 10, weight: .heavy, design: .rounded))
                                .foregroundStyle(MLTheme.mintClean)
                        }

                        Picker("GPU Tier", selection: $qualityPref) {
                            Text("Auto").tag(QualityPreference.auto)
                            Text("Ultra").tag(QualityPreference.ultra)
                            Text("Med").tag(QualityPreference.medium)
                            Text("Low").tag(QualityPreference.low)
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: qualityPref) { _, next in
                            onChangeQuality(next)
                        }

                        Toggle("Show Live Hz / Frame Telemetry Pill", isOn: $showProMotionTelemetry)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.cyanAccent)
                            .onChange(of: showProMotionTelemetry) { _, next in
                                onToggleProMotionTelemetry(next)
                            }

                        Toggle("Reduced Camera Motion", isOn: $reducedMotion)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.cyanAccent)
                            .onChange(of: reducedMotion) { _, next in
                                onChangeReducedMotion(next)
                            }
                    }
                    .mlGlassCard()

                    // Procedural Audio Synthesizer Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("PROCEDURAL AVAUDIOENGINE SYNTH")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        Toggle("Mute All Game Audio", isOn: $isMuted)
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.coralGum)
                            .onChange(of: isMuted) { _, next in
                                onChangeAudio(next, Float(musicVolume), Float(sfxVolume))
                            }

                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("Adaptive Music")
                                Spacer()
                                Text("\(Int((musicVolume * 100).rounded()))%")
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
                                Text("ASMR Scrub & Glass-Harp SFX")
                                Spacer()
                                Text("\(Int((sfxVolume * 100).rounded()))%")
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
                            Label("Replay Cosmic Stardust Prologue", systemImage: "sparkles.tv.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))

                        Text("100% On-Device Privacy • Zero Analytics • Zero Ads")
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.mintClean)

                        Text(CharityInfo.clinicalDisclaimer)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: Color.white.opacity(0.14))
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle("Profile & Settings")
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
}
