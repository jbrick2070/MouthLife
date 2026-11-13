import SwiftUI

@main
struct MouthLifeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var coordinator = AppCoordinator()

    var body: some Scene {
        WindowGroup {
            RootContentView(coordinator: coordinator)
                .onChange(of: scenePhase) { _, newPhase in
                    coordinator.handleScenePhase(newPhase)
                }
        }
    }
}
