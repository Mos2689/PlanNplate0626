import MobileCoreServices
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/**
 The principal class of the PlanNplate share extension.

 What this does, and just as importantly what it does not:

   • It reads the shared item, validates the link, writes it to the App Group,
     confirms, and posts a local notification that takes the user back into
     PlanNplate in one tap. That's the whole job.
   • It does NOT sign in, hold a session, or call any authenticated service.
     Nothing sensitive crosses the process boundary, which is why this feature
     needs no shared Keychain access group.
   • It does NOT force PlanNplate open. `NSExtensionContext.open` is public API
     and is still called, but it was tested on device and answers `false`; the
     `openURL`-through-the-responder-chain workaround is unsupported and is not
     shipped here. The notification is the sanctioned return path, and the copy
     says which one the user is getting rather than implying magic.
   • It does NOT download the post's media. A recipe import needs a link.

 Lifecycle discipline matters here — a share extension is memory-constrained and
 killed without ceremony. The UI renders on the first frame from cached state
 and never blocks on the network; the optional title lookup is capped and
 cancelled the moment the sheet goes away.
 */
class ShareViewController: UIViewController {
  private var state: ShareSheetState = .loading {
    didSet { render() }
  }

  private var hosting: UIHostingController<ShareSheetView>?
  private var titleTask: URLSessionDataTask?
  /// Guards against completing the extension request twice — see `finish()`.
  private var hasCompleted = false
  /// Minted here, at capture. It is the idempotency key for the whole flow —
  /// see lib/share/import-orchestrator.ts.
  private let shareId = UUID().uuidString

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    render()
    loadSharedItem()
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    titleTask?.cancel()
  }

  // MARK: - UI

  private func render() {
    let sheet = ShareSheetView(
      state: state,
      onUndo: { [weak self] in self?.undo() },
      onCancel: { [weak self] in self?.cancel() },
      onDone: { [weak self] in self?.finish() }
    )

    if let hosting {
      hosting.rootView = sheet
    } else {
      let controller = UIHostingController(rootView: sheet)
      controller.view.backgroundColor = .clear
      addChild(controller)
      view.addSubview(controller.view)
      controller.view.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        controller.view.topAnchor.constraint(equalTo: view.topAnchor),
        controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      ])
      controller.didMove(toParent: self)
      hosting = controller
    }

    announce()
  }

  /// VoiceOver would otherwise stay on the state it read when the sheet opened.
  private func announce() {
    let message: String
    switch state {
    case .loading: message = "Checking the recipe"
    case let .saved(host, _, hint):
      // The hint carries the only instruction on the sheet, so it has to be
      // spoken — it arrives after the save and would otherwise never be read.
      let parts: [String?] = ["Saved to PlanNplate. From \(host).", hint]
      message = parts.compactMap { $0 }.joined(separator: " ")
    case .unsupported: message = "This link isn’t supported yet"
    case .noLink: message = "We couldn’t find a recipe link"
    }
    UIAccessibility.post(notification: .announcement, argument: message)
  }

  // MARK: - Reading the share

  private func loadSharedItem() {
    guard let item = (extensionContext?.inputItems as? [NSExtensionItem])?.first,
          let providers = item.attachments, !providers.isEmpty else {
      state = .noLink
      return
    }

    // `public.url` first: Safari, Chrome, YouTube and Pinterest hand over a
    // clean link, and preferring it avoids re-deriving one from a caption that
    // may mention several. Instagram and TikTok only offer text, which is why
    // the plain-text pass exists at all.
    let urlProvider = providers.first { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }
    if let urlProvider {
      urlProvider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] value, _ in
        let text = (value as? URL)?.absoluteString ?? (value as? String)
        self?.handle(text: text, fallbackProviders: providers, itemTitle: item.attributedContentText?.string)
      }
      return
    }

    handle(text: nil, fallbackProviders: providers, itemTitle: item.attributedContentText?.string)
  }

  private func handle(text: String?, fallbackProviders: [NSItemProvider], itemTitle: String?) {
    if let text, case let .ok(url) = SharedLinkExtractor.extract(from: text) {
      accept(url: url, itemTitle: itemTitle)
      return
    }

    let textProvider = fallbackProviders.first {
      $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
    }
    guard let textProvider else {
      DispatchQueue.main.async { [weak self] in
        self?.state = text == nil ? .noLink : .unsupported
      }
      return
    }

    textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] value, _ in
      guard let self else { return }
      let shared = (value as? String) ?? (value as? URL)?.absoluteString
      let combined = [itemTitle, shared].compactMap { $0 }.joined(separator: "\n")

      switch SharedLinkExtractor.extract(from: combined) {
      case let .ok(url):
        self.accept(url: url, itemTitle: itemTitle)
      case .unsupported:
        DispatchQueue.main.async { self.state = .unsupported }
      case .noURL:
        DispatchQueue.main.async { self.state = .noLink }
      }
    }
  }

  private func accept(url: URL, itemTitle: String?) {
    let host = SharedLinkExtractor.displayHost(for: url)
    let raw = itemTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
    let seedTitle = raw.map(SharedLinkExtractor.decodingHTMLEntities)

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      // Save FIRST, render second. Choosing PlanNplate in the share sheet is the
      // decision; asking the user to confirm it again bought nothing and cost a
      // tap at exactly the moment they want to get back to what they were doing.
      self.save(url: url, host: host, title: seedTitle?.isEmpty == false ? seedTitle : nil)
      self.lookUpTitle(for: url, host: host, existing: seedTitle)
    }
  }

  // MARK: - Optional preview title

  /**
   Best-effort `og:title` for the preview line.

   Hard caps, because this runs inside a share sheet: 2.5 seconds, https only,
   the first 256 KB of the response, no retry, cancelled on dismiss. A failure
   is silent — the sheet already shows the domain, which is enough to know what
   is about to be saved.
   */
  private func lookUpTitle(for url: URL, host: String, existing: String?) {
    guard existing?.isEmpty != false, url.scheme?.lowercased() == "https" else { return }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 2.5
    configuration.timeoutIntervalForResource = 2.5
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

    var request = URLRequest(url: url)
    request.setValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      forHTTPHeaderField: "User-Agent"
    )
    request.setValue("text/html", forHTTPHeaderField: "Accept")

    let task = URLSession(configuration: configuration).dataTask(with: request) { [weak self] data, _, _ in
      guard let self, let data else { return }
      let head = data.prefix(256 * 1024)
      guard let html = String(data: head, encoding: .utf8),
            let title = Self.ogTitle(in: html) else { return }

      DispatchQueue.main.async {
        // Decoration only — the link is already saved, so a late title just
        // improves what's on screen and never changes what happens. It is
        // deliberately NOT pushed into the notification: re-posting under the
        // same identifier would replace an already-delivered banner with a
        // second one, and a nicer title isn't worth buzzing the user twice.
        if case let .saved(_, _, hint) = self.state {
          self.state = .saved(host: host, title: title, hint: hint)
        }
      }
    }
    titleTask = task
    task.resume()
  }

  private static func ogTitle(in html: String) -> String? {
    let patterns = [
      "<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']",
      "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:title[\"']",
      "<title[^>]*>([^<]+)</title>",
    ]
    for pattern in patterns {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
            let match = regex.firstMatch(
              in: html,
              range: NSRange(html.startIndex..<html.endIndex, in: html)
            ),
            match.numberOfRanges > 1,
            let range = Range(match.range(at: 1), in: html) else { continue }
      // Meta-tag attribute values arrive HTML-encoded — an Instagram title
      // otherwise renders as `&quot;Comment &#x201c;AUDIENCE&#x201d;…`.
      let decoded = SharedLinkExtractor.decodingHTMLEntities(String(html[range]))
      let title = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
      if !title.isEmpty { return String(title.prefix(120)) }
    }
    return nil
  }

  // MARK: - Completion

  /// How long the confirmation stays up before dismissing itself. Long enough to
  /// read "Saved to PlanNplate" and reach Undo, short enough not to be in the way.
  private static let autoDismissDelay: TimeInterval = 1.8

  private func save(url: URL, host: String, title: String?) {
    let stored = PendingShareQueue.append(id: shareId, url: url, title: title)
    guard stored else {
      // A failed write means the App Group isn't reachable — almost always a
      // provisioning problem, never something the user can act on. Say the link
      // isn't supported rather than claiming a save that didn't happen.
      state = .unsupported
      return
    }

    state = .saved(host: host, title: title, hint: nil)
    // Scheduled unconditionally: if `open` never calls back, the sheet must
    // still go away on its own.
    scheduleAutoDismiss()
    postNotification(host: host, title: title)

    openContainingApp { [weak self] opened in
      guard let self, opened else { return }
      // The app is coming to the front. Leaving our sheet up would get in its
      // way, and a notification pointing at an app the user is already looking
      // at is just noise.
      ShareNotification.withdraw(shareId: self.shareId)
      self.finish()
    }
  }

  /**
   The notification is what actually carries the user back, so what the sheet
   promises has to depend on whether one was really posted. The user may have
   declined notifications for PlanNplate and an extension cannot ask — in that
   case the link still imports, just on their next launch, and the closing line
   says so rather than promising a tap that will never come.
   */
  private func postNotification(host: String, title: String?) {
    ShareNotification.post(host: host, title: title, shareId: shareId) { [weak self] posted in
      guard let self, !self.hasCompleted else { return }
      // Re-reads the state rather than closing over it: a late `og:title` may
      // have landed in between, and this must not undo it.
      guard case let .saved(currentHost, currentTitle, _) = self.state else { return }
      self.state = .saved(
        host: currentHost,
        title: currentTitle,
        hint: posted
          ? "Tap the notification to add it now."
          : "We’ll add it next time you open PlanNplate."
      )
    }
  }

  /**
   Ask iOS to open PlanNplate.

   `NSExtensionContext.open(_:)` is PUBLIC API. Apple documents it for Today
   widgets and iMessage apps, and it has historically answered `false` for share
   extensions. Tested on device here: it answers `false`. It is kept because it
   costs nothing and would start working on its own if that ever changes, and
   because calling a public method that may decline is not a workaround. What we
   deliberately do NOT do is walk the responder chain to reach
   `UIApplication.shared`, which is the unsupported trick this project rules out.

   Answers asynchronously, and must: the completion handler can be delivered on
   the main queue, so blocking the main thread on a semaphore waiting for it
   would deadlock until the timeout and then report `false` even where iOS had
   said yes — which would have turned the experiment into a guaranteed negative.
   */
  private func openContainingApp(completion: @escaping (Bool) -> Void) {
    guard let context = extensionContext,
          let url = URL(string: "plannplate://share-import") else {
      completion(false)
      return
    }

    context.open(url) { success in
      DispatchQueue.main.async { completion(success) }
    }
  }

  private func scheduleAutoDismiss() {
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.autoDismissDelay) { [weak self] in
      self?.finish()
    }
  }

  /**
   Completing the request more than once is a programmer error, and there are now
   three racing routes to it: the auto-dismiss timer, the `open` callback, and the
   Done button. The flag makes whichever arrives first the only one that counts.
   */
  private func finish() {
    guard !hasCompleted else { return }
    hasCompleted = true
    titleTask?.cancel()
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }

  /// Undo — the link is already queued and a notification may already be on
  /// screen, so backing out has to retract both. Leaving the notification would
  /// invite the user to tap into an import that no longer exists.
  private func undo() {
    PendingShareQueue.remove(id: shareId)
    ShareNotification.withdraw(shareId: shareId)
    cancel()
  }

  private func cancel() {
    guard !hasCompleted else { return }
    hasCompleted = true
    titleTask?.cancel()
    extensionContext?.cancelRequest(
      withError: NSError(domain: "app.plannplate.share", code: NSUserCancelledError)
    )
  }
}
