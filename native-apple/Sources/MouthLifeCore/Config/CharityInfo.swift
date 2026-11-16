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

/// A further free-dental-care charity shown under SmileOnU in the charity sheet.
/// To add one: verify every fact and link on the charity's own website, then add an entry to
/// `CharityInfo.moreCharities` here and to `MORE_DENTAL_CHARITIES` in the web edition's charityInfo.ts.
public struct PartnerCharityInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var emoji: String
    public var name: String
    public var legalStatus: String
    public var summary: String
    public var websiteUrl: URL
    public var donateUrl: URL
    public var links: [CharityLinkItem]

    public init(
        id: String,
        emoji: String,
        name: String,
        legalStatus: String,
        summary: String,
        websiteUrl: URL,
        donateUrl: URL,
        links: [CharityLinkItem]
    ) {
        self.id = id
        self.emoji = emoji
        self.name = name
        self.legalStatus = legalStatus
        self.summary = summary
        self.websiteUrl = websiteUrl
        self.donateUrl = donateUrl
        self.links = links
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

    /// Further free-dental-care charities. Facts and links checked against ramusa.org (November 2026).
    public static let moreCharities: [PartnerCharityInfo] = [
        PartnerCharityInfo(
            id: "remote_area_medical",
            emoji: "⛺",
            name: "Remote Area Medical (RAM)",
            legalStatus: "U.S. 501(c)(3) Nonprofit • Since 1985",
            summary: "RAM runs free pop-up clinics across the United States. Volunteers give dental cleanings, fillings, extractions and X-rays, along with free vision and medical care. No insurance is needed.",
            websiteUrl: URL(string: "https://www.ramusa.org/")!,
            donateUrl: URL(string: "https://www.ramusa.org/donate/")!,
            links: [
                CharityLinkItem(
                    id: "ram_schedule",
                    label: "📅 Find a Free Clinic",
                    url: URL(string: "https://www.ramusa.org/schedule/")!
                ),
                CharityLinkItem(
                    id: "ram_volunteer",
                    label: "🤝 Volunteer at a Clinic",
                    url: URL(string: "https://www.ramusa.org/volunteer/")!
                )
            ]
        )
    ]

    public static let moreCharitiesNote = "Each link opens the charity’s own website. MouthLife takes no fee and never handles donations."
}
