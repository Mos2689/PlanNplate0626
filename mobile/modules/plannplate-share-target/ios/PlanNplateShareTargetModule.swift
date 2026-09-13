import ExpoModulesCore
import Foundation

/**
 The app side of the iOS share handoff.

 The share extension runs in its own process, writes what it captured into the
 shared App Group container, and exits — Apple provides no supported way for an
 extension to launch its containing app, and the responder-chain workaround that
 circulates is not something we ship. So the app collects whatever is waiting
 the next time it runs, which is what `getPendingShares` does.

 Reading is destructive on purpose. Once a payload has been handed to
 JavaScript it belongs to `lib/share/pending-share.ts`, which persists it across
 sign-in and onboarding; leaving a copy in the container would mean a crash
 mid-import replays from two places at once.

 The file format is shared with `targets/share/PendingShareQueue.swift`. Keep
 the two in step — an extension cannot import the app's Swift module, so this is
 the one thing in the feature that genuinely exists twice.
 */
public class PlanNplateShareTargetModule: Module {
  /// Must match `ios.entitlements` in app.config.js and the share target's
  /// `expo-target.config.js`.
  private static let appGroupIdentifier = "group.com.vibecode.planplate.8ctfq2"
  private static let queueFileName = "pending-shares.json"

  /// Read by targets/share/ShareImportConfig.swift. Keep the names in step.
  private static let endpointKey = "plannplate.share.import-endpoint"
  private static let accessGroupKey = "plannplate.share.keychain-access-group"

  public func definition() -> ModuleDefinition {
    Name("PlanNplateShareTarget")

    // Declared for parity with Android, where a share can arrive at a running
    // app via onNewIntent. On iOS nothing can push into a running app from an
    // extension, so this never fires — the app polls on foreground instead.
    Events("onShareReceived")

    AsyncFunction("getPendingShares") { () -> [[String: Any]] in
      return Self.drainQueue()
    }

    AsyncFunction("consumePendingShare") { (id: String) in
      Self.removeFromQueue(id: id)
    }

    Function("wasLaunchedFromShare") { () -> Bool in
      // An iOS share never launches the app, so this launch was never caused by
      // one. Reported honestly rather than guessed at.
      return false
    }

    /**
     Can this process actually see the shared container?

     `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil — it does
     not throw — when the App Group entitlement isn't granted by the provisioning
     profile. That makes a missing capability indistinguishable from "no shares
     waiting": both produce an empty queue and total silence.

     Exposed so the app can tell the two apart in one log line instead of a
     build cycle of guesswork.
     */
    Function("isContainerReachable") { () -> Bool in
      return Self.containerDirectory() != nil
    }

    /**
     Tell the share extension where the backend is.

     The extension imports recipes by itself now, which means it needs the
     Supabase functions URL — and that URL differs between .env and
     .env.production. Compiling it into the extension would silently point a
     TestFlight build at the wrong project, so the app publishes whichever one
     it was actually configured with, on every launch.

     The Keychain access group travels the same way because it must carry the
     team prefix (`TEAMID.bundle.id`); a bare bundle id matches nothing and
     fails silently.

     Neither value is a secret. The functions URL ships in the JS bundle already,
     and the access group is in the entitlements of every copy of the app. The
     credential itself never comes through here — it goes in the Keychain.

     Returns false when the container isn't reachable, which is the same signal
     `isContainerReachable` gives and means the App Groups entitlement is missing.
     */
    Function("configureShareImport") { (endpoint: String, keychainAccessGroup: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: Self.appGroupIdentifier) else { return false }
      defaults.set(endpoint, forKey: Self.endpointKey)
      defaults.set(keychainAccessGroup, forKey: Self.accessGroupKey)
      return true
    }
  }

  // MARK: - Shared container

  private static func containerDirectory() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
  }

  private static func queueURL() -> URL? {
    containerDirectory()?.appendingPathComponent(queueFileName)
  }

  /// Read everything waiting and clear the file, coordinated so a share landing
  /// at the same moment is not lost.
  private static func drainQueue() -> [[String: Any]] {
    guard let url = queueURL() else { return [] }

    var drained: [[String: Any]] = []
    var coordinationError: NSError?

    NSFileCoordinator().coordinate(
      writingItemAt: url,
      options: .forMerging,
      error: &coordinationError
    ) { coordinatedURL in
      drained = readQueue(at: coordinatedURL)
      guard !drained.isEmpty else { return }
      writeQueue([], to: coordinatedURL)
    }

    return drained
  }

  private static func removeFromQueue(id: String) {
    guard let url = queueURL() else { return }
    var coordinationError: NSError?

    NSFileCoordinator().coordinate(
      writingItemAt: url,
      options: .forMerging,
      error: &coordinationError
    ) { coordinatedURL in
      let remaining = readQueue(at: coordinatedURL).filter { ($0["id"] as? String) != id }
      writeQueue(remaining, to: coordinatedURL)
    }
  }

  private static func readQueue(at url: URL) -> [[String: Any]] {
    guard let data = try? Data(contentsOf: url),
          let parsed = try? JSONSerialization.jsonObject(with: data),
          let items = parsed as? [[String: Any]] else {
      // A missing or unreadable queue is the normal case (no share yet) and the
      // recoverable case (a truncated write) alike. Both mean "nothing to do".
      return []
    }
    return items.filter { $0["id"] is String }
  }

  private static func writeQueue(_ items: [[String: Any]], to url: URL) {
    guard let data = try? JSONSerialization.data(withJSONObject: items) else { return }
    try? data.write(to: url, options: .atomic)
  }
}
