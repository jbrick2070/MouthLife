// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MouthLifeCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
        // the Apple Watch brushing timer shares the same timeline, copy and rewards
        .watchOS(.v10)
    ],
    products: [
        .library(
            name: "MouthLifeCore",
            targets: ["MouthLifeCore"]
        ),
        // the Apple Watch faces: plain SwiftUI, so they also render on a Mac for checking
        .library(
            name: "MouthLifeWatchUI",
            targets: ["MouthLifeWatchUI"]
        )
    ],
    targets: [
        .target(
            name: "MouthLifeCore",
            path: "Sources/MouthLifeCore"
        ),
        .target(
            name: "MouthLifeWatchUI",
            dependencies: ["MouthLifeCore"],
            path: "Sources/MouthLifeWatchUI"
        ),
        .testTarget(
            name: "MouthLifeCoreTests",
            dependencies: ["MouthLifeCore"],
            path: "Tests/MouthLifeCoreTests"
        ),
        .testTarget(
            name: "MouthLifeWatchUITests",
            dependencies: ["MouthLifeWatchUI", "MouthLifeCore"],
            path: "Tests/MouthLifeWatchUITests"
        )
    ]
)
