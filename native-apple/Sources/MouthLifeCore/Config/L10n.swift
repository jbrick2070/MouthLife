import Foundation

/// Shows the app in the player's language.
///
/// Screens keep writing English. `L10n.t("Save Player")` returns the translation for the current
/// language from the same catalogs the web edition uses (`src/i18n/locales/<lang>.json`, embedded by
/// `scripts/i18n-native.mjs` into `L10nCatalogs.swift`). Text with numbers or names in it is matched
/// by patterns: the key `"Restore {0} colonies"` also matches `"Restore 10 colonies"`.
/// Unknown text comes back unchanged, so a missing translation shows English, never a blank.
public enum L10n {
    private static let lock = NSLock()
    private static var matcher: L10nMatcher?
    private static var code: String = "en"

    /// Two-letter code of the language now in use (`"en"` when no catalog is loaded).
    public static var languageCode: String {
        lock.lock()
        defer { lock.unlock() }
        return code
    }

    /// Switch language. `"en"`, or a code with no catalog, turns translation off.
    public static func setLanguage(_ languageCode: String) {
        var next: L10nMatcher?
        if languageCode != "en",
           let json = L10nCatalogs.json(for: languageCode),
           let data = json.data(using: .utf8),
           let catalog = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] {
            next = L10nMatcher(catalog: catalog)
        }
        lock.lock()
        matcher = next
        code = next == nil ? "en" : languageCode
        lock.unlock()
    }

    /// Translation of an English on-screen string, or the string itself when there is none.
    public static func t(_ english: String) -> String {
        lock.lock()
        let m = matcher
        lock.unlock()
        guard let m else { return english }
        return m.translate(english)
    }
}

/// Lookup tables for one language. Separate from `L10n` so tests can build one from a small catalog.
public final class L10nMatcher {
    private enum Piece {
        case text(String)
        case slot(Int) // capture-group index (1-based)
    }

    private struct Pattern {
        let regex: NSRegularExpression
        let output: [Piece]
        let weight: Int
    }

    private let exact: [String: String]
    private let patterns: [Pattern]
    private let cacheLock = NSLock()
    private var cache: [String: String?] = [:]
    private static let slotRegex = try! NSRegularExpression(pattern: "\\{(\\d+)\\}")

    public init(catalog: [String: String]) {
        var exact: [String: String] = [:]
        var patterns: [Pattern] = []
        for (rawKey, value) in catalog where !value.isEmpty {
            let key = L10nMatcher.normalize(rawKey)
            let keyNS = key as NSString
            let slots = L10nMatcher.slotRegex.matches(in: key, range: NSRange(location: 0, length: keyNS.length))
            if slots.isEmpty {
                exact[key] = value
                continue
            }
            // Build "^literal(.+?)literal$" and remember which slot number each capture group holds.
            var source = "^"
            var order: [Int] = []
            var literalLetters = 0
            var literalLength = 0
            var cursor = 0
            for m in slots {
                let literal = keyNS.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
                source += NSRegularExpression.escapedPattern(for: literal)
                literalLength += (literal as NSString).length
                literalLetters += literal.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
                order.append(Int(keyNS.substring(with: m.range(at: 1))) ?? 0)
                source += "(.+?)"
                cursor = m.range.location + m.range.length
            }
            let tail = keyNS.substring(from: cursor)
            source += NSRegularExpression.escapedPattern(for: tail) + "$"
            literalLength += (tail as NSString).length
            literalLetters += tail.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
            // A key that is almost all slots ("{0}%") would match nearly anything: skip it.
            guard literalLetters >= 2, let regex = try? NSRegularExpression(pattern: source) else { continue }

            // Split the translation into text and slots, mapping slot numbers to capture groups.
            var output: [Piece] = []
            let valueNS = value as NSString
            var vCursor = 0
            for m in L10nMatcher.slotRegex.matches(in: value, range: NSRange(location: 0, length: valueNS.length)) {
                if m.range.location > vCursor {
                    output.append(.text(valueNS.substring(with: NSRange(location: vCursor, length: m.range.location - vCursor))))
                }
                let slotNumber = Int(valueNS.substring(with: m.range(at: 1))) ?? -1
                if let idx = order.firstIndex(of: slotNumber) {
                    output.append(.slot(idx + 1))
                }
                vCursor = m.range.location + m.range.length
            }
            if vCursor < valueNS.length {
                output.append(.text(valueNS.substring(from: vCursor)))
            }
            patterns.append(Pattern(regex: regex, output: output, weight: literalLength))
        }
        self.exact = exact
        // Longer keys are more specific, so they are tried first.
        self.patterns = patterns.sorted { $0.weight > $1.weight }
    }

    private static func normalize(_ s: String) -> String {
        s.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" || $0 == "\r" }).joined(separator: " ")
    }

    private func matchPatterns(_ k: String) -> String? {
        let ns = k as NSString
        let full = NSRange(location: 0, length: ns.length)
        for p in patterns {
            guard let m = p.regex.firstMatch(in: k, range: full) else { continue }
            var out = ""
            for piece in p.output {
                switch piece {
                case let .text(t):
                    out += t
                case let .slot(group):
                    guard group < m.numberOfRanges, m.range(at: group).location != NSNotFound else { continue }
                    let part = ns.substring(with: m.range(at: group))
                    // A slot that is itself known text (a world or city name) is translated too.
                    out += exact[part] ?? part
                }
            }
            return out
        }
        return nil
    }

    /// Translation of an English text, or nil when there is none.
    public func lookup(_ text: String) -> String? {
        let k = L10nMatcher.normalize(text)
        guard !k.isEmpty, k.unicodeScalars.contains(where: { $0.isASCII && CharacterSet.letters.contains($0) }) else {
            return nil
        }
        if let hit = exact[k] { return hit }
        cacheLock.lock()
        if let cached = cache[k] {
            cacheLock.unlock()
            return cached
        }
        cacheLock.unlock()

        var result = matchPatterns(k)
        if result == nil, let firstLetter = k.firstIndex(where: { $0.isLetter || $0.isNumber }), firstLetter != k.startIndex {
            // Screens sometimes put an icon in front of a known line ("🎯 " + goal): translate the rest.
            let prefix = String(k[..<firstLetter])
            let rest = String(k[firstLetter...])
            if prefix.contains(where: { !$0.isWhitespace }), let translated = exact[rest] ?? matchPatterns(rest) {
                result = prefix.trimmingCharacters(in: .whitespaces) + " " + translated
            }
        }
        cacheLock.lock()
        if cache.count > 4000 { cache.removeAll() }
        cache[k] = result
        cacheLock.unlock()
        return result
    }

    public func translate(_ text: String) -> String {
        lookup(text) ?? text
    }
}
