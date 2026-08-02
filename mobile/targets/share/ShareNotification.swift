import Foundation
import UserNotifications

/**
 The one-tap way back into PlanNplate.

 WHY THIS EXISTS. `NSExtensionContext.open(_:)` was run on device and answers
 `false` for a share extension on current iOS. There is no supported way for an
 extension to launch its containing app, and the responder-chain walk to
 `UIApplication.shared` is the unsupported trick this project rules out. So the
 extension does the sanctioned thing instead: it posts a local notification, and
 tapping that launches PlanNplate. Nothing new is needed on the app side to make
 the tap work — `useShareTarget` already drains the queue on every foreground, so
 a launch by any means starts the import.

 `UNUserNotificationCenter.current()` inside an app extension resolves to the
 CONTAINING app's notification centre; the extension's bundle identifier being a
 child of the app's is what makes that pairing legal. Authorization is inherited
 too, and an extension may not request it — it has nowhere to show the prompt —
 so this only ever posts for a user who already said yes to PlanNplate. When they
 haven't, it is a silent no-op, which is why `post` reports back what it did: the
 sheet's closing line has to promise a notification only when one is coming.

 Nothing sensitive crosses this boundary. The payload is a title, a domain and
 the share id — the same three things already in the App Group queue.
 */
enum ShareNotification {
  /// Tagged so the app can tell this apart from a meal-plan reminder. Nothing
  /// reads it today: tapping simply launches PlanNplate and the existing
  /// foreground drain takes over.
  static let kind = "share-import"

  /// Titles come from an `og:title` or a post caption and can run to a
  /// paragraph. A notification title is one line whatever we pass.
  private static let maxTitleLength = 70

  /**
   Post the "tap to add it" notification.

   Called once, at save time. Deliberately not re-posted when a better title
   arrives later: the same identifier would replace an already-delivered banner
   with a second one, which is more irritating than showing the domain.

   `completion` answers on the main queue and reports whether a notification was
   actually scheduled.
   */
  static func post(
    host: String,
    title: String?,
    shareId: String,
    completion: @escaping (Bool) -> Void
  ) {
    let center = UNUserNotificationCenter.current()

    center.getNotificationSettings { settings in
      let permitted =
        settings.authorizationStatus == .authorized
        || settings.authorizationStatus == .provisional
      guard permitted else {
        DispatchQueue.main.async { completion(false) }
        return
      }

      let content = UNMutableNotificationContent()
      // The title is the payoff — seeing what we understood is the point. It
      // falls back to a plain statement of fact rather than inventing one.
      content.title = shortened(title) ?? "Recipe link saved"
      content.subtitle = host
      content.body = "Tap to add it to your recipes."
      content.sound = .default
      content.userInfo = ["kind": kind, "shareId": shareId]

      let request = UNNotificationRequest(
        identifier: identifier(for: shareId),
        content: content,
        trigger: nil // deliver immediately
      )

      center.add(request) { error in
        DispatchQueue.main.async { completion(error == nil) }
      }
    }
  }

  /// Undo, and the case where iOS did open the app after all — a notification
  /// asking the user to go somewhere they already are is just noise.
  static func withdraw(shareId: String) {
    let center = UNUserNotificationCenter.current()
    let ids = [identifier(for: shareId)]
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }

  // MARK: - Helpers

  private static func identifier(for shareId: String) -> String {
    "share-import.\(shareId)"
  }

  private static func shortened(_ title: String?) -> String? {
    guard let title else { return nil }
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }
    guard trimmed.count > maxTitleLength else { return trimmed }
    // `String(...)` first: `prefix` hands back a Substring, and keeping the
    // trimming on a concrete String avoids depending on which StringProtocol
    // conveniences the toolchain exposes.
    let clipped = String(trimmed.prefix(maxTitleLength - 1))
    return clipped.trimmingCharacters(in: .whitespacesAndNewlines) + "…"
  }
}
