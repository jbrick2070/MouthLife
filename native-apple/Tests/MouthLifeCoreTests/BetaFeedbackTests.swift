import XCTest
@testable import MouthLifeCore

/// Rules added after the first outside beta test (iPhone 12 Pro, November 2026): a brush that was
/// interrupted mid-way is kept, and graphics quality follows the device's heat and power state.
final class BetaFeedbackTests: XCTestCase {

    // MARK: - BrushCheckpoint

    func testABrushUnderTwentySecondsIsNotKept() {
        XCTAssertFalse(BrushCheckpoint.isWorthKeeping(brushedSec: 0))
        XCTAssertFalse(BrushCheckpoint.isWorthKeeping(brushedSec: 19.99))
        XCTAssertTrue(BrushCheckpoint.isWorthKeeping(brushedSec: 20))
        XCTAssertTrue(BrushCheckpoint.isWorthKeeping(brushedSec: 100))
        XCTAssertFalse(BrushCheckpoint.isWorthKeeping(brushedSec: .nan))
        XCTAssertFalse(BrushCheckpoint.isWorthKeeping(brushedSec: .infinity))
    }

    func testTheFirstNoteIsDueAtOnceAndThenEveryTenSeconds() {
        XCTAssertTrue(BrushCheckpoint.isDue(lastWriteClockSec: nil, nowClockSec: 0))
        XCTAssertFalse(BrushCheckpoint.isDue(lastWriteClockSec: 30, nowClockSec: 30.05))
        XCTAssertFalse(BrushCheckpoint.isDue(lastWriteClockSec: 30, nowClockSec: 39.99))
        XCTAssertTrue(BrushCheckpoint.isDue(lastWriteClockSec: 30, nowClockSec: 40))
        // The phone slept for a minute between two ticks.
        XCTAssertTrue(BrushCheckpoint.isDue(lastWriteClockSec: 30, nowClockSec: 95))
    }

    func testAClockThatSteppedBackIsDue() {
        XCTAssertTrue(BrushCheckpoint.isDue(lastWriteClockSec: 500, nowClockSec: 3))
    }

    func testANoteCountsAsFullByTheSameGraceAsAFinishedStage() {
        let total = GameConfig.brushAlongTotalSec
        let grace = GameConfig.brushAlongFullBrushGraceSec
        XCTAssertFalse(BrushCheckpoint.countsAsFull(brushedSec: 100))
        XCTAssertFalse(BrushCheckpoint.countsAsFull(brushedSec: total - grace - 0.01))
        XCTAssertTrue(BrushCheckpoint.countsAsFull(brushedSec: total - grace))
        XCTAssertTrue(BrushCheckpoint.countsAsFull(brushedSec: total))
    }

    // MARK: - TestDiary

    private func makeDiary(keep: Int = 250, max: Int = 400) -> (TestDiary, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("mouthlife-diary-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appendingPathComponent("diary.txt")
        return (TestDiary(fileURL: url, keepLines: keep, maxLines: max), url)
    }

    func testTheDiaryKeepsLinesInOrderAndRemembersTheLast() {
        let (diary, _) = makeDiary()
        diary.note("screen HUB -> BRUSH_ALONG")
        diary.note("brush started")
        let lines = diary.text().split(separator: "\n")
        XCTAssertEqual(lines.count, 2)
        XCTAssertTrue(lines[0].hasSuffix("screen HUB -> BRUSH_ALONG"))
        XCTAssertTrue(lines[1].hasSuffix("brush started"))
        XCTAssertEqual(diary.lastNote, "brush started")
    }

    func testAWatchdogLineIsOnDiskAtOnceAndDoesNotReplaceTheLastNote() {
        let (diary, url) = makeDiary()
        diary.note("brush stage BRUSHING")
        diary.noteNow("HANG main thread has not answered for 2.0 s")
        let onDisk = String(decoding: (try? Data(contentsOf: url)) ?? Data(), as: UTF8.self)
        XCTAssertTrue(onDisk.contains("HANG main thread"))
        XCTAssertEqual(diary.lastNote, "brush stage BRUSHING")
    }

    func testAQuietNoteIsWrittenButDoesNotReplaceTheLastNote() {
        let (diary, _) = makeDiary()
        diary.note("screen HUB -> BRUSH_ALONG")
        diary.note("frame rate 58", rememberAsLast: false)
        XCTAssertEqual(diary.text().split(separator: "\n").count, 2)
        XCTAssertEqual(diary.lastNote, "screen HUB -> BRUSH_ALONG")
    }

    func testTheDiaryIsTrimmedToItsNewestLines() {
        let (diary, _) = makeDiary(keep: 5, max: 8)
        for i in 1...20 { diary.note("line \(i)") }
        let lines = diary.text().split(separator: "\n")
        XCTAssertLessThanOrEqual(lines.count, 8)
        XCTAssertGreaterThanOrEqual(lines.count, 5)
        XCTAssertTrue(lines.last?.hasSuffix("line 20") ?? false)
        XCTAssertFalse(lines.contains { $0.hasSuffix("line 1") })
    }

    func testALaterLaunchCountsWhatAnEarlierOneLeft() {
        let (first, url) = makeDiary(keep: 3, max: 5)
        for i in 1...4 { first.note("old \(i)") }
        _ = first.text()
        let second = TestDiary(fileURL: url, keepLines: 3, maxLines: 5)
        second.note("new 1")
        second.note("new 2")
        let lines = second.text().split(separator: "\n")
        XCTAssertLessThanOrEqual(lines.count, 5)
        XCTAssertTrue(lines.last?.hasSuffix("new 2") ?? false)
        XCTAssertFalse(lines.contains { $0.hasSuffix("old 1") })
    }

    func testANoteIsAlwaysOneLine() {
        let (diary, _) = makeDiary()
        diary.note("first\nsecond\r\nthird")
        XCTAssertEqual(diary.text().split(separator: "\n").count, 1)
    }

    func testADiaryWithNowhereToWriteDoesNothing() {
        let diary = TestDiary(fileURL: nil)
        diary.note("lost")
        diary.noteNow("lost too")
        XCTAssertEqual(diary.text(), "")
        XCTAssertEqual(diary.lastNote, "lost")
    }

    func testManyThreadsCanWriteAtOnce() {
        let (diary, _) = makeDiary(keep: 500, max: 1000)
        DispatchQueue.concurrentPerform(iterations: 200) { i in diary.note("t \(i)") }
        XCTAssertEqual(diary.text().split(separator: "\n").count, 200)
    }

    func testClearEmptiesTheDiary() {
        let (diary, _) = makeDiary()
        diary.note("something")
        diary.clear()
        XCTAssertEqual(diary.text(), "")
        XCTAssertEqual(diary.lastNote, "")
        diary.note("after")
        XCTAssertEqual(diary.text().split(separator: "\n").count, 1)
    }

    // MARK: - MainThreadWatch

    func testAnUnarmedWatchNeverPingsOrReports() {
        var watch = MainThreadWatch()
        for t in 0..<60 { XCTAssertEqual(watch.tick(nowSec: Double(t)), .none) }
    }

    func testAnAnsweringMainThreadIsNeverReported() {
        var watch = MainThreadWatch()
        watch.setArmed(true)
        for t in 0..<30 {
            XCTAssertEqual(watch.tick(nowSec: Double(t)), .ping)
            XCTAssertNil(watch.mainAnswered(nowSec: Double(t) + 0.01))
        }
    }

    func testAStalledMainThreadIsReportedAtTwoTenAndThirtySeconds() {
        var watch = MainThreadWatch()
        watch.setArmed(true)
        XCTAssertEqual(watch.tick(nowSec: 100), .ping)
        XCTAssertEqual(watch.tick(nowSec: 101), .none)
        XCTAssertEqual(watch.tick(nowSec: 102), .report(stalledSec: 2))
        for t in 103...109 { XCTAssertEqual(watch.tick(nowSec: Double(t)), .none) }
        XCTAssertEqual(watch.tick(nowSec: 110), .report(stalledSec: 10))
        for t in 111...129 { XCTAssertEqual(watch.tick(nowSec: Double(t)), .none) }
        XCTAssertEqual(watch.tick(nowSec: 130), .report(stalledSec: 30))
        for t in 131...200 { XCTAssertEqual(watch.tick(nowSec: Double(t)), .none) }
        // It comes back: the diary is told how long it was gone, and the watch starts over.
        XCTAssertEqual(watch.mainAnswered(nowSec: 201) ?? -1, 101, accuracy: 0.001)
        XCTAssertEqual(watch.tick(nowSec: 202), .ping)
    }

    func testASuspendedAppIsNotAHang() {
        var watch = MainThreadWatch()
        watch.setArmed(true)
        XCTAssertEqual(watch.tick(nowSec: 10), .ping)
        // Nothing ran for a minute (the watchdog included): no judgement, then a fresh ping.
        XCTAssertEqual(watch.tick(nowSec: 70), .none)
        XCTAssertEqual(watch.tick(nowSec: 71), .ping)
        // The old ping finally runs: nothing was reported, so nothing is said.
        XCTAssertNil(watch.mainAnswered(nowSec: 71.1))
    }

    func testLeavingTheScreenForgetsAStallInProgress() {
        var watch = MainThreadWatch()
        watch.setArmed(true)
        XCTAssertEqual(watch.tick(nowSec: 0), .ping)
        XCTAssertEqual(watch.tick(nowSec: 1), .none)
        watch.setArmed(false)
        XCTAssertEqual(watch.tick(nowSec: 2), .none)
        XCTAssertNil(watch.mainAnswered(nowSec: 2.5))
        watch.setArmed(true)
        XCTAssertEqual(watch.tick(nowSec: 3), .ping)
    }

    // MARK: - QualityGovernor

    func testACoolDeviceOnFullPowerGetsUltra() {
        XCTAssertEqual(QualityGovernor.tier(heat: .nominal, lowPowerMode: false), .ultra)
    }

    func testLowPowerModeGivesAtMostMedium() {
        XCTAssertEqual(QualityGovernor.tier(heat: .nominal, lowPowerMode: true), .medium)
        XCTAssertEqual(QualityGovernor.tier(heat: .fair, lowPowerMode: true), .medium)
        XCTAssertEqual(QualityGovernor.tier(heat: .serious, lowPowerMode: true), .low)
    }

    func testAWarmDeviceGetsMediumAndAHotOneLow() {
        XCTAssertEqual(QualityGovernor.tier(heat: .fair, lowPowerMode: false), .medium)
        XCTAssertEqual(QualityGovernor.tier(heat: .serious, lowPowerMode: false), .low)
        XCTAssertEqual(QualityGovernor.tier(heat: .critical, lowPowerMode: false), .low)
    }

    func testQualityNeverRisesAsTheDeviceGetsHotter() {
        func rank(_ t: QualityTier) -> Int {
            switch t {
            case .low: return 0
            case .medium: return 1
            case .ultra: return 2
            }
        }
        for lowPower in [false, true] {
            var previous = Int.max
            for heat in QualityGovernor.Heat.allCases {
                let r = rank(QualityGovernor.tier(heat: heat, lowPowerMode: lowPower))
                XCTAssertLessThanOrEqual(r, previous, "\(heat) lowPower=\(lowPower)")
                previous = r
            }
        }
    }
}
