import AVFoundation
import MouthLifeCore

/// The iPhone's own 2-Min Brush songs on the watch speaker (or the child's earbuds): the brush song
/// while brushing, the floss song while flossing and the rinse song while rinsing, the same picks as
/// the phone. The watch copies are cut to each stage and made mono for the small speaker
/// (`Music/make-watch-music.sh`). The ritual's clock leads; the song follows it.
@MainActor
final class WatchMusic {
    private var player: AVAudioPlayer?
    private var stage: WatchRitualStage?
    /// Players fading out after a stage change, kept until their fade ends.
    private var fading: [AVAudioPlayer] = []
    private var sessionActive = false

    /// The song for each stage (nil: quiet).
    static func song(_ stage: WatchRitualStage) -> String? {
        switch stage {
        case .brushing: return "watch_brush"
        case .floss: return "watch_floss"
        case .rinse: return "watch_rinse"
        case .done: return nil
        }
    }

    /// Makes the music match the ritual: the stage's song at the ritual's place in it, playing while
    /// the ritual runs and stopped while it is paused. Cheap to call often.
    func follow(_ ritual: WatchRitual?) {
        guard let r = ritual, let name = Self.song(r.stage) else { return stop() }
        if stage != r.stage || player == nil {
            switchTo(r.stage, name: name, at: r.stageElapsed)
        }
        guard let player else { return }
        if r.paused {
            if player.isPlaying { player.pause() }
            return
        }
        // keep the song with the clock (a long stall or a resume moves the clock on)
        let at = r.stageElapsed.truncatingRemainder(dividingBy: max(1, player.duration))
        if abs(player.currentTime - at) > 1.5 { player.currentTime = at }
        if !player.isPlaying {
            activate()
            // a song starting mid-way (a resume, a new stage) fades in; from its start it just plays
            let fadeIn: TimeInterval = player.currentTime < 0.5 ? 0 : 0.6
            player.volume = fadeIn > 0 ? 0 : 1
            player.play()
            if fadeIn > 0 { player.setVolume(1, fadeDuration: fadeIn) }
        }
    }

    /// Fades out and lets the watch's audio go (after Done, End, or leaving the app).
    func stop(fade: TimeInterval = 1.2) {
        stage = nil
        guard let old = player else { return }
        player = nil
        fadeOut(old, over: fade)
    }

    private func switchTo(_ next: WatchRitualStage, name: String, at time: TimeInterval) {
        if let old = player {
            player = nil
            fadeOut(old, over: 0.85)
        }
        stage = next
        guard let url = Bundle.main.url(forResource: name, withExtension: "m4a"),
              let incoming = try? AVAudioPlayer(contentsOf: url) else { return }
        // the rinse can outlast its song; the others end with their stage
        incoming.numberOfLoops = next == .rinse ? -1 : 0
        incoming.prepareToPlay()
        incoming.currentTime = time.truncatingRemainder(dividingBy: max(1, incoming.duration))
        player = incoming
    }

    private func fadeOut(_ p: AVAudioPlayer, over seconds: TimeInterval) {
        guard p.isPlaying else { return release() }
        p.setVolume(0, fadeDuration: seconds)
        fading.append(p)
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds + 0.1))
            p.stop()
            self?.fading.removeAll { $0 === p }
            self?.release()
        }
    }

    /// Short in-app audio plays on the watch speaker, or on Bluetooth earbuds when they are on.
    private func activate() {
        guard !sessionActive else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, policy: .default, options: [])
        try? session.setActive(true)
        sessionActive = true
    }

    private func release() {
        guard sessionActive, player == nil, fading.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        sessionActive = false
    }
}
