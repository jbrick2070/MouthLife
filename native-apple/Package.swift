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
        ),
        // the Home Screen and Lock Screen widgets' views: plain SwiftUI, rendered on a Mac in tests
        .library(
            name: "MouthLifeWidgetUI",
            targets: ["MouthLifeWidgetUI"]
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
        .target(
            name: "MouthLifeWidgetUI",
            dependencies: ["MouthLifeCore"],
            path: "Sources/MouthLifeWidgetUI"
        ),
        .testTarget(
            name: "MouthLifeWidgetUITests",
            dependencies: ["MouthLifeWidgetUI", "MouthLifeCore"],
            path: "Tests/MouthLifeWidgetUITests"
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
