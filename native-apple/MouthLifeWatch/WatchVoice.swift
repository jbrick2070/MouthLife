import AVFoundation
import MouthLifeCore

/// The coach's few spoken words on the watch, kept to one word per change: "Brush" when the brush
/// starts, the quarter numbers ("Two" ... "Four") as the phone counts them, then "Floss", "Rinse" and
/// "Done" (the phone's own words, in the coach's eight languages). The screen and the taps carry
/// everything else.
@MainActor
final class WatchVoice {
    private let synth = AVSpeechSynthesizer()

    func say(_ text: String, _ lang: CoachLanguage) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: lang.bcp47VoiceCode)
            ?? AVSpeechSynthesisVoice(language: lang.rawValue)
        utterance.volume = 1
        synth.stopSpeaking(at: .immediate)
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }
}
