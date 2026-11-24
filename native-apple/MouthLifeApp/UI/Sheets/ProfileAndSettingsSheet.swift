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
    @State private var includeRinse: Bool
    @State private var remindersOn: Bool
    @State private var reminderMorning: Int
    @State private var reminderEvening: Int
    @State private var remindersBlocked = false
    @State private var showProMotionTelemetry: Bool
    @State private var showPrivacyPolicy = false
    @State private var showRinseGate = false
    @State private var showReminderGate = false
    @State private var healthLogOn: Bool
    @State private var healthBlocked = false
    @State private var showEraseGate = false
    /// Erase Save: a grown-up answered the question, and the button now waits for its second tap.
    @State private var eraseArmed = false
    /// Erase Save was done from this sheet, which is now closing. Its fields still hold the old
    /// name, so nothing they do from here on is saved.
    @State private var erased = false
    /// How long the button waits for that second tap before it goes back, in seconds.
    private static let eraseArmedSec: Double = 6
    private let healthAvailable: Bool
    private let brushWeek: [BrushDays.Day]

    public let onSaveProfile: (String, Int, String) -> Void
    public let onChangeQuality: (QualityPreference) -> Void
    public let onChangeAudio: (Bool, Float, Float) -> Void
    public let onChangeVoiceCoach: (Bool) -> Void
    public let onChangeLanguage: (CoachLanguage) -> Void
    public let onChangeReducedMotion: (Bool) -> Void
    public let onChangeIncludeRinse: (Bool) -> Void
    public let onSetReminders: (Bool, @escaping (Bool) -> Void) -> Void
    public let onSetReminderTimes: (Int, Int) -> Void
    public let onSetHealthLog: (Bool, @escaping (Bool) -> Void) -> Void
    public let onToggleProMotionTelemetry: (Bool) -> Void
    public let onReplayCosmicIntro: () -> Void
    public let onEraseSave: () -> Void

    public init(
        profile: PlayerHostProfile,
        qualityPref: QualityPreference,
        isMuted: Bool,
        musicVolume: Float,
        sfxVolume: Float,
        voiceCoachEnabled: Bool = true,
        coachLanguage: CoachLanguage = .english,
        reducedMotion: Bool,
        includeRinse: Bool = true,
        brushWeek: [BrushDays.Day] = [],
        remindersOn: Bool = false,
        reminderMorning: Int = BrushDays.defaultMorning,
        reminderEvening: Int = BrushDays.defaultEvening,
        healthAvailable: Bool = false,
        healthLogOn: Bool = false,
        showProMotionTelemetry: Bool,
        onSaveProfile: @escaping (String, Int, String) -> Void,
        onChangeQuality: @escaping (QualityPreference) -> Void,
        onChangeAudio: @escaping (Bool, Float, Float) -> Void,
        onChangeVoiceCoach: @escaping (Bool) -> Void = { _ in },
        onChangeLanguage: @escaping (CoachLanguage) -> Void = { _ in },
        onChangeReducedMotion: @escaping (Bool) -> Void,
        onChangeIncludeRinse: @escaping (Bool) -> Void = { _ in },
        onSetReminders: @escaping (Bool, @escaping (Bool) -> Void) -> Void = { _, done in done(false) },
        onSetReminderTimes: @escaping (Int, Int) -> Void = { _, _ in },
        onSetHealthLog: @escaping (Bool, @escaping (Bool) -> Void) -> Void = { _, done in done(false) },
        onToggleProMotionTelemetry: @escaping (Bool) -> Void,
        onReplayCosmicIntro: @escaping () -> Void,
        onEraseSave: @escaping () -> Void = {}
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
        _includeRinse = State(initialValue: includeRinse)
        _remindersOn = State(initialValue: remindersOn)
        _reminderMorning = State(initialValue: reminderMorning)
        _reminderEvening = State(initialValue: reminderEvening)
        self.brushWeek = brushWeek
        self.healthAvailable = healthAvailable
        _healthLogOn = State(initialValue: healthLogOn)
        _showProMotionTelemetry = State(initialValue: showProMotionTelemetry)
        self.onSaveProfile = onSaveProfile
        self.onChangeQuality = onChangeQuality
        self.onChangeAudio = onChangeAudio
        self.onChangeVoiceCoach = onChangeVoiceCoach
        self.onChangeLanguage = onChangeLanguage
        self.onChangeReducedMotion = onChangeReducedMotion
        self.onChangeIncludeRinse = onChangeIncludeRinse
        self.onSetReminders = onSetReminders
        self.onSetReminderTimes = onSetReminderTimes
        self.onSetHealthLog = onSetHealthLog
        self.onToggleProMotionTelemetry = onToggleProMotionTelemetry
        self.onReplayCosmicIntro = onReplayCosmicIntro
        self.onEraseSave = onEraseSave
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
                                saveProfile(newValue, skinToneIndex, homeCityId)
                            }

                        Text(L10n.t("Skin Tone Swatch"))
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)

                        HStack(spacing: 10) {
                            ForEach(HostsAndHistory.skinToneSwatches) { swatch in
                                let selected = skinToneIndex == swatch.index
                                Button {
                                    skinToneIndex = swatch.index
                                    saveProfile(displayName, swatch.index, homeCityId)
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
                                        saveProfile(displayName, skinToneIndex, city.id)
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

                    // Brushing card: the fluoride rinse is off until a grown-up confirms the brusher is
                    // 6 or older (it is not for younger children); turning it off needs no question.
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L10n.t("Brushing"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        Text(L10n.t("2-Min Brush works with any toothbrush, electric too. It shows where to brush and for how long."))
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)

                        Toggle(L10n.t("💧 Fluoride Rinse Step"), isOn: Binding(
                            get: { includeRinse },
                            set: { on in
                                if on {
                                    showRinseGate = true
                                } else {
                                    includeRinse = false
                                    onChangeIncludeRinse(false)
                                }
                            }
                        ))
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.mintClean)
                            .accessibilityHint(L10n.t("For grown-ups: ages 6 and up. Follow the label."))

                        Text(L10n.t("For grown-ups: ages 6 and up. Follow the label."))
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                            .accessibilityHidden(true)

                        // This week: a column a day, a mark for each full brush (morning and evening)
                        let brushes = BrushDays.count(brushWeek)
                        let brushesText = L10n.t(brushes == 1 ? "1 brush this week" : "\(brushes) brushes this week")
                        Text(L10n.t("This week"))
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textSecondary)
                            .padding(.top, 6)
                        BrushWeekStrip(days: brushWeek, language: coachLanguage)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(brushesText)
                        Text(brushesText)
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(MLTheme.textPrimary)
                            .accessibilityHidden(true)

                        // Reminders: a grown-up turns them on; the system asks once for permission
                        Toggle(L10n.t("⏰ Brush Reminders"), isOn: Binding(
                            get: { remindersOn },
                            set: { on in
                                if on {
                                    showReminderGate = true
                                } else {
                                    remindersOn = false
                                    onSetReminders(false) { _ in }
                                }
                            }
                        ))
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .tint(MLTheme.mintClean)
                            .padding(.top, 6)
                            .sheet(isPresented: $showReminderGate) {
                                ParentGateView(note: L10n.t("Reminders are set by a grown-up.")) {
                                    onSetReminders(true) { allowed in
                                        remindersOn = allowed
                                        remindersBlocked = !allowed
                                    }
                                }
                                .presentationDetents([.medium])
                            }

                        if remindersOn {
                            DatePicker(L10n.t("☀️ Morning"), selection: timeBinding(morning: true), displayedComponents: .hourAndMinute)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                            DatePicker(L10n.t("🌙 Evening"), selection: timeBinding(morning: false), displayedComponents: .hourAndMinute)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                        }

                        Text(remindersBlocked
                            ? L10n.t("Notifications are off for MouthLife. A grown-up can allow them in Settings.")
                            : L10n.t("For grown-ups: a gentle nudge at these times."))
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)

                        // Apple Health: Apple's own Health sheet asks (once ever); no extra question
                        if healthAvailable {
                            Toggle(L10n.t("❤️ Apple Health"), isOn: Binding(
                                get: { healthLogOn },
                                set: { on in
                                    if on {
                                        onSetHealthLog(true) { allowed in
                                            healthLogOn = allowed
                                            healthBlocked = !allowed
                                        }
                                    } else {
                                        healthLogOn = false
                                        healthBlocked = false
                                        onSetHealthLog(false) { _ in }
                                    }
                                }
                            ))
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .tint(MLTheme.mintClean)
                                .padding(.top, 6)

                            Text(healthBlocked
                                ? L10n.t("Health access is off. A grown-up can allow it in the Health app.")
                                : L10n.t("For grown-ups: each brush is saved to Health."))
                                .font(.system(.caption, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                    }
                    .mlGlassCard()
                    .sheet(isPresented: $showRinseGate) {
                        ParentGateView(note: L10n.t("Only for brushers aged 6 and up.")) {
                            includeRinse = true
                            onChangeIncludeRinse(true)
                        }
                        .presentationDetents([.medium])
                    }

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

                        Button {
                            showPrivacyPolicy = true
                        } label: {
                            Label(L10n.t("Privacy Policy"), systemImage: "lock.shield")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                        .sheet(isPresented: $showPrivacyPolicy) { PrivacyPolicyView() }

                        // The erase the privacy policy promises ("at any time in Settings")
                        eraseSaveButton

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

extension ProfileAndSettingsSheet {
    /// A reminder time (minutes after midnight) as a time of day for the picker.
    fileprivate func timeBinding(morning: Bool) -> Binding<Date> {
        Binding(
            get: {
                let minutes = morning ? reminderMorning : reminderEvening
                return Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()) ?? Date()
            },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
                if morning { reminderMorning = minutes } else { reminderEvening = minutes }
                onSetReminderTimes(reminderMorning, reminderEvening)
            }
        )
    }

    /// Saves the name, swatch and home city. Not after Erase Save: the sheet is closing then and
    /// its fields still hold the old name, which must not come back into the fresh save.
    fileprivate func saveProfile(_ name: String, _ skinTone: Int, _ homeCity: String) {
        guard !erased else { return }
        onSaveProfile(name, skinTone, homeCity)
    }

    /// Erase Save, for grown-ups. The first tap asks the grown-up question; after the right answer
    /// the button asks for a second tap, and that one erases. Leaving the sheet or waiting a few
    /// seconds puts the button back. The two labels are the web's (`#btn-reset-save` in
    /// CompanionHubOverlay.ts), so both editions share one translation.
    fileprivate var eraseSaveButton: some View {
        Button {
            guard !erased else { return }
            guard eraseArmed else {
                showEraseGate = true
                return
            }
            eraseArmed = false
            erased = true
            dismiss()
            onEraseSave()
        } label: {
            Text(L10n.t(eraseArmed ? "⚠️ Tap Again to Erase" : "🔄 Erase Save"))
                .foregroundStyle(eraseArmed ? MLTheme.coralGum : MLTheme.textPrimary)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(MLGlassPillButtonStyle(tint: eraseArmed ? MLTheme.coralGum : MLTheme.textSecondary))
        .sheet(isPresented: $showEraseGate) {
            ParentGateView(note: L10n.t("🔄 Erase Save")) {
                eraseArmed = true
            }
            .presentationDetents([.medium])
        }
        .task(id: eraseArmed) {
            // Armed for a few seconds only, counted in real time (also while the phone is locked).
            guard eraseArmed else { return }
            try? await Task.sleep(for: .seconds(Self.eraseArmedSec), clock: .continuous)
            if !Task.isCancelled { eraseArmed = false }
        }
    }
}

/// "This week": a column for each of the last seven days (today last, outlined), with a mark for
/// each full brush, up to two.
struct BrushWeekStrip: View {
    let days: [BrushDays.Day]
    let language: CoachLanguage

    var body: some View {
        let format = DateFormatter()
        format.locale = Locale(identifier: language.rawValue)
        format.setLocalizedDateFormatFromTemplate(String(repeating: "E", count: 5)) // a one-letter weekday
        return HStack(spacing: 4) {
            ForEach(days, id: \.dateKey) { day in
                VStack(spacing: 4) {
                    Text(format.string(from: day.date))
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)
                    ForEach(0..<BrushDays.goalPerDay, id: \.self) { i in
                        Circle()
                            .fill(i < day.full ? MLTheme.mintClean : Color.clear)
                            .overlay(Circle().strokeBorder(i < day.full ? MLTheme.mintClean : Color.white.opacity(0.3), lineWidth: 1.5))
                            .frame(width: 13, height: 13)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(day.isToday ? MLTheme.mintClean.opacity(0.12) : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(day.isToday ? MLTheme.mintClean.opacity(0.45) : Color.clear, lineWidth: 1))
            }
        }
    }
}

/// The privacy policy, in the app (no link out): what MouthLife keeps, where, and what it never does.
/// The web edition shows the same sections, in the same words, from src/ui/privacyNotice.ts.
struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss

    private let sections: [(String, String)] = [
        ("No personal data", "MouthLife does not collect, send, rent or sell any personal data, analytics, device identifiers, location or usage data. There are no accounts, no tracking and no advertising."),
        ("Everything stays on this device", "Progress, Habit Stamps and settings are saved only on this device. A Sync Code or backup file is made on the device, and only you can copy it to your other devices. You can erase all saved data at any time in Settings. On iPhone, a grown-up can choose to save each brush to Apple Health; MouthLife never reads health data."),
        ("Not medical advice", "MouthLife is an educational game and a 2-minute brushing timer. It is not a substitute for advice, diagnosis or treatment from a dentist. Ask a dentist or dental hygienist about your oral health."),
        ("Charity links", "The charity pages are optional and open only after a grown-up answers a question. MouthLife is not affiliated with these charities, takes no fee and never handles donations; each website has its own policies."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(L10n.t("Zero Sign-Up • Zero Tracking • 100% On-Device"))
                        .font(.system(.footnote, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.mintClean)
                    ForEach(sections, id: \.0) { section in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(L10n.t(section.0))
                                .font(.system(.headline, design: .rounded, weight: .heavy))
                                .foregroundStyle(MLTheme.textPrimary)
                            Text(L10n.t(section.1))
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Text(L10n.t("Effective November 2026"))
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(MLTheme.textMuted)
                }
                .padding(18)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("Privacy Policy"))
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

