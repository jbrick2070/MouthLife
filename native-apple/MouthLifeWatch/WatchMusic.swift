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
    private var duckTask: Task<Void, Never>?
    /// A call, Siri or an alarm has the audio: no song tries to start until it is given back.
    private var interrupted = false
    /// After a song failed to start, the next try waits until this uptime (not every second).
    private var retryAfter: TimeInterval = 0
    private var interruptionObserver: NSObjectProtocol?

    init() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let began = raw.flatMap(AVAudioSession.InterruptionType.init(rawValue:)) == .began
            MainActor.assumeIsolated { self?.interruption(began: began) }
        }
    }

    /// The system took the audio away (the player pauses itself) or gave it back (the next
    /// `follow` starts the song again at the ritual's place).
    private func interruption(began: Bool) {
        WatchLog.note("audio interruption \(began ? "began" : "ended")")
        interrupted = began
        if began { sessionActive = false } else { retryAfter = 0 }
    }

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
        if r.paused || r.awaitingStart {
            // quiet while paused or on a Start card, and the watch's audio let go until it carries on
            if player.isPlaying { player.pause() }
            release()
            return
        }
        // keep the song with the clock (a long stall or a resume moves the clock on)
        let at = r.stageElapsed.truncatingRemainder(dividingBy: max(1, player.duration))
        if abs(player.currentTime - at) > 1.5 { player.currentTime = at }
        if !player.isPlaying {
            let now = ProcessInfo.processInfo.systemUptime
            guard !interrupted, now >= retryAfter else { return }
            guard activate() else {
                retryAfter = now + 5
                return
            }
            // a song starting mid-way (a resume, a new stage) fades in; from its start it just plays
            let fadeIn: TimeInterval = player.currentTime < 0.5 ? 0 : 0.6
            player.volume = fadeIn > 0 ? 0 : 1
            guard player.play() else {
                WatchLog.note("song did not start")
                retryAfter = now + 5
                return
            }
            retryAfter = 0
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

    /// The song dips for a moment while the coach says its one word.
    func duck(for seconds: TimeInterval = 1.4) {
        guard let p = player, p.isPlaying else { return }
        p.setVolume(0.35, fadeDuration: 0.12)
        duckTask?.cancel()
        duckTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, let self, let now = self.player, now === p, now.isPlaying else { return }
            now.setVolume(1, fadeDuration: 0.4)
        }
    }

    /// Short in-app audio plays on the watch speaker, or on Bluetooth earbuds when they are on.
    /// Activated again every time a song starts (a call, Siri or an alarm may have taken the audio
    /// away in between; setting it active again is cheap). False when the audio could not be had.
    @discardableResult
    private func activate() -> Bool {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, policy: .default, options: [])
            try session.setActive(true)
        } catch {
            WatchLog.note("audio activate failed: \(error)")
            return false
        }
        sessionActive = true
        return true
    }

    private func release() {
        guard sessionActive, !(player?.isPlaying ?? false), fading.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        sessionActive = false
    }
}
