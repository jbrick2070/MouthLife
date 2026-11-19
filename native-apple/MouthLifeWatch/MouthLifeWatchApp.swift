import MouthLifeCore
import MouthLifeWatchUI
import SwiftUI

/// MouthLife on Apple Watch: brush, floss and (when a grown-up has turned it on, on the iPhone)
/// rinse, with taps on the wrist. Each finished brush goes to the iPhone, which pays the reward.
@main
struct MouthLifeWatchApp: App {
    @State private var controller = WatchController()

    var body: some Scene {
        WindowGroup {
            WatchRootView(controller: controller)
        }
    }
}

struct WatchRootView: View {
    let controller: WatchController
    @Environment(\.isLuminanceReduced) private var dimmed
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var state: WatchFaceState {
        WatchFaceState(
            ritual: controller.ritual,
            language: controller.language,
            includeRinse: controller.settings.includeRinse,
            canResume: controller.resumable != nil,
            ack: controller.ack,
            // "Sending" only while the iPhone app is there to answer; otherwise "Saved on watch"
            syncPending: controller.companionInstalled
                && (controller.ritual.map { r in controller.outbox.contains { $0.sessionId == r.sessionId.uuidString } } ?? false),
            dimmed: dimmed,
            reduceMotion: reduceMotion
        )
    }

    var body: some View {
        Group {
            if let ritual = controller.ritual {
                if ritual.stage == .done {
                    WatchDoneFace(state: state, onClose: { controller.close() })
                } else if controller.showControls {
                    WatchControlsFace(
                        state: state,
                        armed: controller.armed,
                        onPause: { controller.togglePause() },
                        onNext: { controller.tapNext() },
                        onSkip: { controller.tapSkip() },
                        onEnd: { controller.tapEnd() },
                        onClose: { controller.closeControls() }
                    )
                } else {
                    WatchActiveFace(state: state, onMore: { controller.openControls() }, onResume: { controller.togglePause() })
                }
            } else {
                WatchReadyFace(state: state, onStart: { controller.start() }, onResume: { controller.resume() })
            }
        }
        // the 3-2-1 pops in and out (still in Always On and with Reduce Motion)
        .animation(reduceMotion || dimmed ? nil : .easeInOut(duration: 0.2), value: controller.ritual?.countdownDigit)
        // deep purple-black behind every face (purple and gold, like the owner's team)
        .background(WatchLook.background.ignoresSafeArea())
    }
}
