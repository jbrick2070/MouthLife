import Foundation

public struct CharityProgramInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var emoji: String
    public var title: String
    public var regionLabel: String
    public var summary: String
    public var url: URL

    public init(
        id: String,
        emoji: String,
        title: String,
        regionLabel: String,
        summary: String,
        url: URL
    ) {
        self.id = id
        self.emoji = emoji
        self.title = title
        self.regionLabel = regionLabel
        self.summary = summary
        self.url = url
    }
}

public struct CharityLinkItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var url: URL

    public init(id: String, label: String, url: URL) {
        self.id = id
        self.label = label
        self.url = url
    }
}

public struct CharityNeedStat: Codable, Equatable, Sendable, Identifiable {
    public var id: String { stat }
    public var stat: String
    public var detail: String

    public init(stat: String, detail: String) {
        self.stat = stat
        self.detail = detail
    }
}

/// Verified public information and links for SmileOnU (https://smileonu.org/),
/// a U.S. 501(c)(3) humanitarian dental relief nonprofit.
public enum CharityInfo {
    public static let name = "SmileOnU"
    public static let tagline = "Sm:)e Forward • Universal Dental Relief Organization"
    public static let legalStatus = "U.S. 501(c)(3) Public Charity • Founded 2012 by BB Maboby"
    public static let einNote = "Recognized IRS 501(c)(3) tax-exempt public charity; 100% of external contributions go directly to SmileOnU on SmileOnU.org with zero in-app fees."
    public static let missionSummary = "SmileOnU expands access to free, life-changing dental care, pain relief, oral health education, and reconstructive treatment for underserved children, adults, and communities across the United States and around the world — improving lives one smile at a time."

    public static let websiteUrl: URL = {
        guard let url = URL(string: "https://smileonu.org/") else {
            preconditionFailure("Invalid static SmileOnU website URL")
        }
        return url
    }()

    public static let donateUrl: URL = {
        guard let url = URL(string: "https://smileonu.org/donate/") else {
            preconditionFailure("Invalid static SmileOnU donate URL")
        }
        return url
    }()

    public static let contactEmail = "info@smileonu.org"
    public static let contactMailto = "mailto:info@smileonu.org"
    public static let contactMailtoUrl: URL = {
        guard let url = URL(string: "mailto:info@smileonu.org") else {
            preconditionFailure("Invalid static SmileOnU mailto URL")
        }
        return url
    }()

    public static let independenceNote = "MouthLife is a free, independent dental arcade & brushing companion. If you enjoyed the game, please consider supporting real-world charitable dental relief directly at SmileOnU.org."
    public static let transparencyNote = independenceNote
    public static let clinicalDisclaimer = "MouthLife is an educational oral-science game and brushing timer, not a medical device or clinical diagnostic service. Always consult a licensed dentist or dental hygienist for personal oral healthcare."

    public static let needHighlights: [CharityNeedStat] = [
        CharityNeedStat(
            stat: "#1 Worldwide",
            detail: "Tooth decay remains the #1 noncontagious disease globally"
        ),
        CharityNeedStat(
            stat: "1 in 5 Kids",
            detail: "Children suffering from untreated cavities and dental pain"
        ),
        CharityNeedStat(
            stat: "46% of Adults",
            detail: "Adults showing clinical signs of gum disease"
        )
    ]

    public static let programs: [CharityProgramInfo] = [
        CharityProgramInfo(
            id: "new_smile",
            emoji: "✨",
            title: "New Smile Program",
            regionLabel: "U.S. Hardship Care",
            summary: "Provides free, comprehensive dental treatment to individuals whose oral health has been affected by hardship as they pursue education, employment, and a confident new chapter.",
            url: URL(string: "https://smileonu.org/new-smile-program/")!
        ),
        CharityProgramInfo(
            id: "mobile_outreach",
            emoji: "🚐",
            title: "Mobile Dental Outreach",
            regionLabel: "Los Angeles • Orange County • San Diego",
            summary: "Mobilizes volunteer dental providers to deliver oral health education, cleanings, fillings, and pain-relieving extractions in communities with little or no access to care.",
            url: URL(string: "https://smileonu.org/mobile-dental-outreach/")!
        ),
        CharityProgramInfo(
            id: "international_clinics",
            emoji: "🌎",
            title: "International Dental Clinics",
            regionLabel: "Global Relief & Baja, Mexico Orphanage Camps",
            summary: "Travels to underserved communities and children’s orphanages to provide screenings, preventive education, cleanings, restorative fillings, extractions, and surgical care.",
            url: URL(string: "https://smileonu.org/international-dental-clinics/")!
        )
    ]

    public static let involvementLinks: [CharityLinkItem] = [
        CharityLinkItem(
            id: "volunteer",
            label: "🤝 Volunteer on a Clinic",
            url: URL(string: "https://smileonu.org/volunteer-application/")!
        ),
        CharityLinkItem(
            id: "dentist_partner",
            label: "🦷 Become a Partner Dentist",
            url: URL(string: "https://smileonu.org/become-a-smileonu-dentist/")!
        ),
        CharityLinkItem(
            id: "founder",
            label: "💛 Founder’s Message",
            url: URL(string: "https://smileonu.org/message-from-the-founder/")!
        ),
        CharityLinkItem(
            id: "board",
            label: "🏛️ Board of Directors",
            url: URL(string: "https://smileonu.org/board-of-directors/")!
        ),
        CharityLinkItem(
            id: "events",
            label: "📅 Clinics & CEUs for Charity",
            url: URL(string: "https://smileonu.org/upcoming-events/")!
        )
    ]

    public static let socialLinks: [CharityLinkItem] = [
        CharityLinkItem(
            id: "facebook",
            label: "Facebook",
            url: URL(string: "https://www.facebook.com/SmileOnU")!
        ),
        CharityLinkItem(
            id: "youtube",
            label: "YouTube",
            url: URL(string: "https://www.youtube.com/channel/UC_rgCZ076xzvGbbLBX705Ew")!
        ),
        CharityLinkItem(
            id: "twitter",
            label: "X (@SmileOnU_)",
            url: URL(string: "https://twitter.com/SmileOnU_")!
        )
    ]
}
