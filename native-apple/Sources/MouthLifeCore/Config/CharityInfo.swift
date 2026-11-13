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
    public static let missionSummary = "SmileOnU gives free dental care to children, adults and communities who cannot get it. They work in the United States and around the world, one smile at a time."

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

    public static let independenceNote = "MouthLife is a free game and brushing timer. If you liked it, you can help real people get dental care at SmileOnU.org."
    public static let transparencyNote = independenceNote
    public static let clinicalDisclaimer = "MouthLife is a learning game and brushing timer. It is not a medical tool. Always ask a dentist or dental hygienist about your own teeth."

    public static let needHighlights: [CharityNeedStat] = [
        CharityNeedStat(
            stat: "#1 Worldwide",
            detail: "Tooth decay is the world’s most common disease you can’t catch"
        ),
        CharityNeedStat(
            stat: "1 in 5 Kids",
            detail: "Children living with cavities and tooth pain"
        ),
        CharityNeedStat(
            stat: "46% of Adults",
            detail: "Adults who show signs of gum disease"
        )
    ]

    public static let programs: [CharityProgramInfo] = [
        CharityProgramInfo(
            id: "new_smile",
            emoji: "✨",
            title: "New Smile Program",
            regionLabel: "U.S. Hardship Care",
            summary: "Gives free, full dental care to people going through hard times, so they can go to school, find work and smile again.",
            url: URL(string: "https://smileonu.org/new-smile-program/")!
        ),
        CharityProgramInfo(
            id: "mobile_outreach",
            emoji: "🚐",
            title: "Mobile Dental Outreach",
            regionLabel: "Los Angeles • Orange County • San Diego",
            summary: "Volunteer dentists bring lessons, cleanings, fillings and pain relief to places with little or no dental care.",
            url: URL(string: "https://smileonu.org/mobile-dental-outreach/")!
        ),
        CharityProgramInfo(
            id: "international_clinics",
            emoji: "🌎",
            title: "International Dental Clinics",
            regionLabel: "World Relief & Baja, Mexico Children’s Homes",
            summary: "Teams travel to children’s homes and places with little care. They give check-ups, lessons, cleanings, fillings and surgery.",
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
