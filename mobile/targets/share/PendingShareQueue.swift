import Foundation

/**
 The extension's side of the App Group handoff.

 What crosses this boundary is deliberately minimal: an id, a link, an optional
 title and a timestamp. **No credentials, no session, no user data.** That isn't
 caution for its own sake — it's what lets the extension exist at all without
 moving the app's Supabase session into a shared Keychain access group, which
 would have meant a migration risk for every signed-in user of a shipping build.

 An extension cannot import the app's Swift module, so the format below is
 mirrored in `modules/plannplate-share-target/ios/PlanNplateShareTargetModule.swift`.
 That file drains what this one appends. Change one, change both.

 Writes are coordinated because two processes can touch this file: the user can
 share a second link while the app is being launched to drain the first.
 */
enum PendingShareQueue {
  /// Must match `ios.entitlements` in app.config.js and `expo-target.config.js`.
  static let appGroupIdentifier = "group.com.vibecode.planplate.8ctfq2"
  private static let fileName = "pending-shares.json"

  /// A backlog this deep means the app hasn't been opened in a long time.
  /// Oldest entries are dropped rather than growing without bound.
  private static let maxQueued = 10

  static func append(id: String, url: URL, title: String?) -> Bool {
    guard let fileURL = queueURL() else { return false }

    var entry: [String: Any] = [
      "id": id,
      "url": url.absoluteString,
      "capturedAt": Date().timeIntervalSince1970 * 1000,
    ]
    if let title, !title.isEmpty {
      entry["subject"] = title
    }

    var didWrite = false
    var coordinationError: NSError?

    NSFileCoordinator().coordinate(
      writingItemAt: fileURL,
      options: .forMerging,
      error: &coordinationError
    ) { coordinatedURL in
      var items = read(at: coordinatedURL)
      items.append(entry)
      if items.count > maxQueued {
        items = Array(items.suffix(maxQueued))
      }
      didWrite = write(items, to: coordinatedURL)
    }

    return didWrite && coordinationError == nil
  }

  /// Undo. The link was queued the moment the sheet appeared, so backing out has
  /// to actually remove it — otherwise the app would import something the user
  /// visibly cancelled.
  static func remove(id: String) {
    guard let fileURL = queueURL() else { return }
    var coordinationError: NSError?

    NSFileCoordinator().coordinate(
      writingItemAt: fileURL,
      options: .forMerging,
      error: &coordinationError
    ) { coordinatedURL in
      let remaining = read(at: coordinatedURL).filter { ($0["id"] as? String) != id }
      _ = write(remaining, to: coordinatedURL)
    }
  }

  private static func queueURL() -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
      .appendingPathComponent(fileName)
  }

  private static func read(at url: URL) -> [[String: Any]] {
    guard let data = try? Data(contentsOf: url),
          let parsed = try? JSONSerialization.jsonObject(with: data),
          let items = parsed as? [[String: Any]] else {
      return []
    }
    return items
  }

  private static func write(_ items: [[String: Any]], to url: URL) -> Bool {
    guard let data = try? JSONSerialization.data(withJSONObject: items) else { return false }
    do {
      try data.write(to: url, options: .atomic)
      return true
    } catch {
      return false
    }
  }
}
