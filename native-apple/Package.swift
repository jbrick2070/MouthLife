// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MouthLifeCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "MouthLifeCore",
            targets: ["MouthLifeCore"]
        )
    ],
    targets: [
        .target(
            name: "MouthLifeCore",
            path: "Sources/MouthLifeCore"
        ),
        .testTarget(
            name: "MouthLifeCoreTests",
            dependencies: ["MouthLifeCore"],
            path: "Tests/MouthLifeCoreTests"
        )
    ]
)
