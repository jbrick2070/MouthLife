import CoreGraphics
import Foundation

/// The iPhone Duo's inner screen as two pages: where the fold runs and which rectangle each page
/// gets. Nil everywhere else (the cover, every other iPhone, iPad, Mac, Split View), so callers keep
/// today's single-screen layout. A plain value worked out once per layout pass: no state, nothing per
/// frame. The app reads the fold with SwiftUI's `reservedRegions` (iOS 27.1) and hands the frames to
/// `make`.
///
/// The first page (left when the Duo is open like a book, the upright half in Tabletop) holds the 3D
/// view; the second page holds the other half of each two-screen layout (the city map, the whole
/// mouth, Home's deck). Nothing is drawn or tapped within `gutter` of the fold.
public struct DuoSplit: Equatable, Sendable {
    public enum Axis: Equatable, Sendable {
        /// Open flat like a book: the fold runs top to bottom, the pages side by side.
        case sideBySide
        /// Tabletop (half open): the fold runs across, the upright page on top.
        case stacked
    }

    public let axis: Axis
    /// The fold line in the root view's coordinate space (x for `.sideBySide`, y for `.stacked`).
    public let fold: CGFloat
    /// The clear band on each side of the fold.
    public let gutter: CGFloat
    /// The root view's size (inside the safe area).
    public let size: CGSize
    /// The root's safe-area insets on the far sides of the first page (right in a book, bottom in
    /// Tabletop), for the 3D view, which ignores the safe area.
    public let safeTrailing: CGFloat
    public let safeBottom: CGFloat

    public static let minimumGutter: CGFloat = 24
    /// Each page must be at least this long along the split, or there is no split.
    public static let minimumPage: CGFloat = 300

    public init(axis: Axis, fold: CGFloat, gutter: CGFloat, size: CGSize, safeTrailing: CGFloat = 0, safeBottom: CGFloat = 0) {
        self.axis = axis
        self.fold = fold
        self.gutter = gutter
        self.size = size
        self.safeTrailing = safeTrailing
        self.safeBottom = safeBottom
    }

    /// The left page (book) or the upright page (Tabletop).
    public var firstRect: CGRect {
        switch axis {
        case .sideBySide: return CGRect(x: 0, y: 0, width: max(0, fold - gutter), height: size.height)
        case .stacked: return CGRect(x: 0, y: 0, width: size.width, height: max(0, fold - gutter))
        }
    }

    /// The right page (book) or the flat page (Tabletop).
    public var secondRect: CGRect {
        switch axis {
        case .sideBySide: return CGRect(x: fold + gutter, y: 0, width: max(0, size.width - fold - gutter), height: size.height)
        case .stacked: return CGRect(x: 0, y: fold + gutter, width: size.width, height: max(0, size.height - fold - gutter))
        }
    }

    /// Padding (trailing, bottom) that shrinks a full-screen view which ignores the safe area (the 3D
    /// view) to the first page. The safe area on the far side is added, because that padding is
    /// measured from the screen's edge.
    public var viewportTrailing: CGFloat {
        axis == .sideBySide ? size.width - firstRect.maxX + safeTrailing : 0
    }

    public var viewportBottom: CGFloat {
        axis == .stacked ? size.height - firstRect.maxY + safeBottom : 0
    }

    /// The split for a fold reported as `folds` (frames in the root's space), or nil. A fold that runs
    /// the full height is a book; one that runs the full width is Tabletop.
    public static func make(folds: [CGRect], size: CGSize, safeTrailing: CGFloat = 0, safeBottom: CGFloat = 0) -> DuoSplit? {
        guard size.width > 0, size.height > 0 else { return nil }
        for frame in folds where frame.width.isFinite && frame.height.isFinite {
            let tall = frame.height >= size.height * 0.9 && frame.width < size.width * 0.25
            let wide = frame.width >= size.width * 0.9 && frame.height < size.height * 0.25
            guard tall || wide else { continue }
            let fold = tall ? frame.midX : frame.midY
            let gutter = max(minimumGutter, (tall ? frame.width : frame.height) / 2)
            let length = tall ? size.width : size.height
            guard fold - gutter >= minimumPage, length - fold - gutter >= minimumPage else { continue }
            return DuoSplit(axis: tall ? .sideBySide : .stacked, fold: fold, gutter: gutter, size: size, safeTrailing: safeTrailing, safeBottom: safeBottom)
        }
        return nil
    }
}
