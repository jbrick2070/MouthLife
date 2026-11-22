import Foundation

/// Where one tooth meets the next along x. Web twin: `src/engine/render/toothSeams.ts`.
public enum ToothSeams {
    /// A wall this narrow (along x) can be the contact between two teeth. A wider one is a
    /// sideways wall or a block inside a tooth, and must not pinch the gumline.
    public static let maxWallWidth: Double = 3.5
    /// A contact between two teeth runs out to the gum: its wall comes this close to the tooth's edge.
    public static let gumReach: Double = 1.0

    /// Every zone boundary, and the middle of every narrow divider wall that reaches the gum. The
    /// stage mesh necks the crown in and raises a gum point at each. A wall standing free inside a
    /// tooth (a spur, the wall of an inner room) is not a seam.
    public static func seamsX(_ cartridge: WorldCartridge) -> [Double] {
        var seams = Set<Int>()
        for district in cartridge.districts.dropFirst() {
            seams.insert(Int((district.bounds.minX * 10.0).rounded()))
        }
        var edgeMinZ = Double.infinity
        var edgeMaxZ = -Double.infinity
        for b in cartridge.playableMaskBoxes {
            edgeMinZ = min(edgeMinZ, b.minZ)
            edgeMaxZ = max(edgeMaxZ, b.maxZ)
        }
        for w in cartridge.wallBoxes where w.maxX - w.minX <= maxWallWidth {
            guard w.minZ <= edgeMinZ + gumReach || w.maxZ >= edgeMaxZ - gumReach else { continue }
            seams.insert(Int(((w.minX + w.maxX) * 5.0).rounded()))
        }
        return seams.map { Double($0) / 10.0 }.sorted()
    }
}
