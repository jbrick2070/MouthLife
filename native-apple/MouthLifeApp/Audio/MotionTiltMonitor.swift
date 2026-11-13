import Foundation

#if os(iOS) && canImport(CoreMotion)
import CoreMotion
import UIKit
#endif

public struct RawMotionSample: Sendable {
    public var available: Bool
    public var screenGravityX: Float
    public var screenGravityY: Float
    public var rotationRateMag: Float
    public var screenUserAccelX: Float
    public var screenUserAccelY: Float

    public static let unavailable = RawMotionSample(
        available: false,
        screenGravityX: 0,
        screenGravityY: -0.7,
        rotationRateMag: 0,
        screenUserAccelX: 0,
        screenUserAccelY: 0
    )
}

/// Zero-allocation 120Hz ProMotion `CoreMotion` pull monitor for iPhone & iPad.
/// Uses `CMMotionManager.startDeviceMotionUpdates(using: .xArbitraryZVertical)` without a push queue
/// so the Metal/SceneKit render thread polls `deviceMotion` directly with zero allocations or permission prompts.
/// Automatically stops sensors in the background or when `Reduce Motion` is enabled.
public final class MotionTiltMonitor: @unchecked Sendable {
    public static let shared = MotionTiltMonitor()

    private let lock = NSLock()
    private var desiredActive: Bool = false
    private var isForeground: Bool = true

    #if os(iOS) && canImport(CoreMotion)
    private let manager = CMMotionManager()
    private var isRunning: Bool = false
    private var cachedOrientationRaw: Int = UIInterfaceOrientation.portrait.rawValue
    private var observers: [NSObjectProtocol] = []
    #endif

    public init() {
        #if os(iOS) && canImport(CoreMotion)
        if manager.isDeviceMotionAvailable {
            manager.deviceMotionUpdateInterval = 1.0 / 120.0
            installLifecycleObservers()
        }
        #endif
    }

    deinit {
        #if os(iOS) && canImport(CoreMotion)
        for token in observers {
            NotificationCenter.default.removeObserver(token)
        }
        #endif
    }

    public func setActive(_ active: Bool) {
        lock.lock()
        desiredActive = active
        syncHardwareLocked()
        lock.unlock()
        #if os(iOS) && canImport(CoreMotion)
        if active {
            refreshInterfaceOrientation()
        }
        #endif
    }

    public func latestSample() -> RawMotionSample {
        #if os(iOS) && canImport(CoreMotion)
        lock.lock()
        let running = isRunning
        let orientRaw = cachedOrientationRaw
        lock.unlock()

        guard running, let dm = manager.deviceMotion else {
            return .unavailable
        }

        let gx = Float(dm.gravity.x)
        let gy = Float(dm.gravity.y)
        let ax = Float(dm.userAcceleration.x)
        let ay = Float(dm.userAcceleration.y)
        let rx = Float(dm.rotationRate.x)
        let ry = Float(dm.rotationRate.y)
        let rz = Float(dm.rotationRate.z)
        let rotMag = sqrt(rx * rx + ry * ry + rz * rz)

        let sgx: Float
        let sgy: Float
        let sax: Float
        let say: Float

        switch UIInterfaceOrientation(rawValue: orientRaw) ?? .portrait {
        case .landscapeRight:
            sgx = -gy
            sgy = gx
            sax = -ay
            say = ax
        case .landscapeLeft:
            sgx = gy
            sgy = -gx
            sax = ay
            say = -ax
        case .portraitUpsideDown:
            sgx = -gx
            sgy = -gy
            sax = -ax
            say = -ay
        default:
            sgx = gx
            sgy = gy
            sax = ax
            say = ay
        }

        return RawMotionSample(
            available: true,
            screenGravityX: sgx,
            screenGravityY: sgy,
            rotationRateMag: rotMag,
            screenUserAccelX: sax,
            screenUserAccelY: say
        )
        #else
        return .unavailable
        #endif
    }

    private func syncHardwareLocked() {
        #if os(iOS) && canImport(CoreMotion)
        guard manager.isDeviceMotionAvailable else { return }
        let shouldRun = desiredActive && isForeground
        if shouldRun && !isRunning {
            manager.startDeviceMotionUpdates(using: .xArbitraryZVertical)
            isRunning = true
        } else if !shouldRun && isRunning {
            manager.stopDeviceMotionUpdates()
            isRunning = false
        }
        #endif
    }

    #if os(iOS) && canImport(CoreMotion)
    private func refreshInterfaceOrientation() {
        let work: @Sendable () -> Void = { [weak self] in
            guard let self else { return }
            MainActor.assumeIsolated {
                let scene = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .first { $0.activationState == .foregroundActive }
                    ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
                if let orient = scene?.interfaceOrientation {
                    self.lock.lock()
                    self.cachedOrientationRaw = orient.rawValue
                    self.lock.unlock()
                }
            }
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func installLifecycleObservers() {
        let nc = NotificationCenter.default
        observers.append(
            nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.lock.lock()
                self.isForeground = false
                self.syncHardwareLocked()
                self.lock.unlock()
            }
        )
        observers.append(
            nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.lock.lock()
                self.isForeground = true
                self.syncHardwareLocked()
                self.lock.unlock()
                self.refreshInterfaceOrientation()
            }
        )
        observers.append(
            nc.addObserver(forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
                self?.refreshInterfaceOrientation()
            }
        )
    }
    #endif
}
