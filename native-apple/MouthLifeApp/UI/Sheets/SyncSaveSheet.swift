import SwiftUI
import MouthLifeCore
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
                                switch onImportCode(importInput) {
                                case .success:
                                    statusIsError = false
                                    statusMessage = "Save imported! Habit Stamps and records are updated."
                                    importInput = ""
                                case .failure(let err):
                                    statusIsError = true
                                    statusMessage = err.localizedDescription
                                }
                            } label: {
                                Label(L10n.t("Apply Sync Code"), systemImage: "arrow.down.doc.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                            .disabled(importInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }

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
