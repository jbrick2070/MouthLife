import SwiftUI
import MouthLifeCore
import UniformTypeIdentifiers
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

public struct SyncSaveSheet: View {
    @Environment(\.dismiss) private var dismiss

    public let exportedCode: String
    public let onImportCode: (String) -> Result<Void, Error>

    @State private var importInput: String = ""
    @State private var statusMessage: String?
    @State private var statusIsError: Bool = false
    @State private var showBackupPicker: Bool = false

    public init(
        exportedCode: String,
        onImportCode: @escaping (String) -> Result<Void, Error>
    ) {
        self.exportedCode = exportedCode
        self.onImportCode = onImportCode
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(L10n.t("CROSS-PLATFORM ML2: SYNC CODE"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        Text(L10n.t("Works on iPhone, iPad, Mac and the MouthLife web game. No account needed."))
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)

                        Text(L10n.t(exportedCode))
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(4)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.black.opacity(0.32)))

                        Button {
                            copyToClipboard(exportedCode)
                            statusIsError = false
                            statusMessage = "Copied ML2: Sync Code to clipboard!"
                        } label: {
                            Label(L10n.t("Copy Current ML2: Code"), systemImage: "doc.on.doc.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.cyanAccent, darkText: true))
                    }
                    .mlGlassCard()

                    VStack(alignment: .leading, spacing: 10) {
                        Text(L10n.t("IMPORT ML2: SYNC CODE"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.mintClean)

                        TextField(L10n.t("Paste ML2:... sync code here"), text: $importInput, axis: .vertical)
                            .syncCodeEntry()
                            .lineLimit(3...6)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(MLTheme.textPrimary)
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06)))

                        HStack(spacing: 10) {
                            Button(L10n.t("Paste Clipboard")) {
                                if let str = readClipboard() {
                                    importInput = str
                                }
                            }
                            .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))

                            Button {
                                applyImport(importInput)
                            } label: {
                                Label(L10n.t("Apply Sync Code"), systemImage: "arrow.down.doc.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                            .disabled(importInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }

                        // A backup.mouthlife.json saved by the web game goes in through the same
                        // checks and merge as a code (H08).
                        Button(L10n.t("📂 Open Backup File")) {
                            showBackupPicker = true
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))

                        if let statusMessage {
                            Text(L10n.t(statusMessage))
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(statusIsError ? MLTheme.coralGum : MLTheme.mintClean)
                        }
                    }
                    .mlGlassCard()
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("Save & ML2: Sync"))
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
        .fileImporter(
            isPresented: $showBackupPicker,
            allowedContentTypes: [.json, .plainText],
            allowsMultipleSelection: false
        ) { result in
            importBackupFile(result)
        }
    }

    private func applyImport(_ text: String) {
        switch onImportCode(text) {
        case .success:
            statusIsError = false
            statusMessage = "Save imported! Habit Stamps and records are updated."
            importInput = ""
        case .failure(let err):
            statusIsError = true
            statusMessage = err.localizedDescription
        }
    }

    private func importBackupFile(_ result: Result<[URL], Error>) {
        // Cancelled or refused: nothing changes.
        guard case .success(let urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.count <= 262_144,
              let text = String(data: data, encoding: .utf8)
        else {
            statusIsError = true
            statusMessage = SyncCodeError.invalidJson.localizedDescription
            return
        }
        applyImport(text)
    }

    private func copyToClipboard(_ value: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = value
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #endif
    }

    private func readClipboard() -> String? {
        #if canImport(UIKit)
        return UIPasteboard.general.string
        #elseif canImport(AppKit)
        return NSPasteboard.general.string(forType: .string)
        #else
        return nil
        #endif
    }
}

/// The Prologue's "Have a Sync Code?": a returning player on a new device pastes the code from their
/// other device and their progress comes across (merged, never overwritten), then the game goes
/// Home. Web twin: the restore sheet in `src/ui/CosmicIntroOverlay.ts`.
public struct SyncRestoreSheet: View {
    @Environment(\.dismiss) private var dismiss
    public let onImportCode: (String) -> Result<Void, Error>

    @State private var importInput: String = ""
    @State private var errorMessage: String?

    public init(onImportCode: @escaping (String) -> Result<Void, Error>) {
        self.onImportCode = onImportCode
    }

    public var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.t("Paste the Sync Code from your other phone or computer to bring your progress here."))
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                TextField(L10n.t("Paste ML2:... sync code here"), text: $importInput, axis: .vertical)
                    .syncCodeEntry()
                    .lineLimit(3...6)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(MLTheme.textPrimary)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06)))

                HStack(spacing: 10) {
                    Button(L10n.t("Paste Clipboard")) {
                        if let str = readClipboard() { importInput = str }
                    }
                    .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))

                    Button {
                        if case .failure(let err) = onImportCode(importInput) {
                            errorMessage = L10n.t(err.localizedDescription) + " " + L10n.t("Your current progress was not changed.")
                        }
                    } label: {
                        Label(L10n.t("Apply Sync Code"), systemImage: "arrow.down.doc.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                    .disabled(importInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(MLTheme.coralGum)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("Have a Sync Code?"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.t("Not now")) { dismiss() }
                        .foregroundStyle(MLTheme.cyanAccent)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.dark)
    }

    private func readClipboard() -> String? {
        #if canImport(UIKit)
        return UIPasteboard.general.string
        #elseif canImport(AppKit)
        return NSPasteboard.general.string(forType: .string)
        #else
        return nil
        #endif
    }
}

private extension View {
    /// A Sync Code is typed exactly: no autocorrect or capitals changing its letters.
    func syncCodeEntry() -> some View {
        #if os(iOS)
        return self.autocorrectionDisabled().textInputAutocapitalization(.never)
        #else
        return self.autocorrectionDisabled()
        #endif
    }
}
