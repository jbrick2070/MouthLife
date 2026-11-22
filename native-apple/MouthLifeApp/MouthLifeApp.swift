import SwiftUI

@main
struct MouthLifeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var coordinator = AppCoordinator()

    var body: some Scene {
        #if os(macOS)
        // One game, one window. A second window would share the one camera, show a second pause card
        // and start the finale song twice, so the Mac gets no File > New Window; closing the window
        // quits the app (and its music) instead of leaving it running with nothing to see.
        Window("MouthLife", id: "main") {
            root
                .frame(minWidth: 800, minHeight: 600)
        }
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1280, height: 800)
        #else
        WindowGroup {
            root
        }
        #endif
    }

    private var root: some View {
        RootContentView(coordinator: coordinator)
            .onChange(of: scenePhase) { _, newPhase in
                coordinator.handleScenePhase(newPhase)
            }
    }
}
