import MobileCoreServices
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/**
 The principal class of the PlanNplate share extension.

 What this does, and just as importantly what it does not:

   • It reads the shared item, validates the link, queues it, and then IMPORTS
     IT — fetching the page here on the device and handing the HTML to the
     `share-import` edge function, which extracts the recipe and saves it. On
     success the queued copy is removed and the sheet dismisses itself. That is
     the whole job, and it is one touch point: choosing PlanNplate.
   • It does NOT hold a Supabase session. It carries a share-import token
     (src/lib/share/import-token.ts) that resolves to one user, authorises one
     action and is revoked on sign-out. A session token would open the whole
     account, and an extension is launched by arbitrary third-party apps with
     whatever content they choose to hand it.
   • It does NOT force PlanNplate open, and no longer needs to. Apple offers no
     sanctioned way for an extension to launch its containing app —
     `NSExtensionContext.open` answers `false` for share extensions — which is
     precisely why the import had to stop depending on the app being open.
   • It does NOT download the post's media. A recipe import needs a link; the
     server pulls the hero image from the page's own meta tags.

 THE QUEUE IS STILL WRITTEN FIRST, BEFORE THE NETWORK. If the import succeeds
 the entry is removed; if anything at all goes wrong — offline, signed out,
 allowance spent, server down, this process killed mid-request — the entry
 survives and the app imports it on next open, exactly as it did before. There
 is no path through this file that can lose a user's link.

 Lifecycle discipline matters here — a share extension is memory-constrained and
 killed without ceremony. The UI renders on the first frame and never blocks;
 every network task is cancelled the moment the sheet goes away.
 */
class ShareViewController: UIViewController {
  private var state: ShareSheetState = .importing(ShareContext(host: "", title: nil, imageURL: nil)) {
    // `announce` is driven by STATE only, never by `dispatch`. The send-off
    // advances through five phases in under a second, and announcing each one
    // would read the same sentence five times over.
    didSet { render(); announce() }
  }

  /// What the user shared, accumulated as we learn it: host and title on the
  /// first frame, the post's photo a second or two later once the page has been
  /// read. Held here so a late arrival can update the state without the callback
  /// needing to know which state we're in.
  private var context = ShareContext(host: "", title: nil, imageURL: nil)

  private var hosting: UIHostingController<ShareSheetView>?
  /// Owns the in-flight fetch/import so it dies with the sheet.
  private let importer = RecipeImportClient()
  /// Guards against completing the extension request twice — see `finish()`.
  private var hasCompleted = false
  /// Minted here, at capture. It is the idempotency key for the whole flow —
  /// see lib/share/import-orchestrator.ts.
  private let shareId = UUID().uuidString
  /// Set once the link is in the App Group queue, so `undo` knows there is
  /// something to remove.
  private var queued = false
  /// Where the send-off has got to. Advanced by `beginDispatch`; the view reads
  /// it and derives every transform from it.
  private var dispatch: DispatchPhase = .idle {
    didSet { render() }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    view.isOpaque = false
    render()
    loadSharedItem()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    makeContainerTransparent()
  }

  /**
   Let the host app show through instead of a grey slab.

   A share extension is presented by the HOST inside a container this process
   does not own and cannot resize, and every view in that container paints its
   own opaque background. Clearing `self.view` is not enough — the result is a
   near-full-screen grey card with our sheet stranded at the bottom of it, which
   is what shipped in the first build.

   Walking up the chain and clearing those backgrounds is the whole fix. These
   are ordinary `UIView`s in our own hierarchy — no private API, nothing
   undocumented — and every step is best-effort. If some future iOS stops
   honouring it, the container simply goes back to being opaque, which is exactly
   how it looks today; nothing breaks and the layout is unchanged, because the
   card is pinned to the bottom either way.

   Runs in `viewWillAppear` rather than `viewDidLoad` because the ancestors do
   not exist until the view is being added to the window.
   */
  private func makeContainerTransparent() {
    var node: UIView? = view
    while let current = node {
      current.backgroundColor = .clear
      current.isOpaque = false
      node = current.superview
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    importer.cancel()
  }

  // MARK: - UI

  private func render() {
    let sheet = ShareSheetView(
      state: state,
      dispatch: dispatch,
      onUndo: { [weak self] in self?.undo() },
      onCancel: { [weak self] in self?.cancel() }
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
  }

  /// VoiceOver would otherwise stay on the state it read when the sheet opened.
  private func announce() {
    let message: String
    switch state {
    case let .importing(context):
      message = context.host.isEmpty
        ? "Saving your recipe"
        : "Saving your recipe from \(context.host)"
    case let .imported(_, recipe):
      message = "Saved to PlanNplate. \(recipe.name). It's in your recipes."
    case let .duplicate(_, recipe):
      message = "Already in PlanNplate. \(recipe.name)."
    case let .queued(context, hint):
      // The hint carries the only instruction on the sheet, so it has to be
      // spoken — it arrives after the save and would otherwise never be read.
      message = ["Saved to PlanNplate. From \(context.host).", hint]
        .compactMap { $0 }.joined(separator: " ")
    case .gated:
      message = "You've used your free imports. We've kept this link."
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
      // Queue FIRST, import second. Choosing PlanNplate in the share sheet is
      // the decision; capturing the link is harmless, reversible, and the only
      // thing standing between a killed process and a lost recipe.
      self.queue(url: url, host: host, title: seedTitle?.isEmpty == false ? seedTitle : nil)
    }
  }

  // MARK: - Import

  private func queue(url: URL, host: String, title: String?) {
    let stored = PendingShareQueue.append(id: shareId, url: url, title: title)
    guard stored else {
      // A failed write means the App Group isn't reachable — almost always a
      // provisioning problem, never something the user can act on. Say the link
      // isn't supported rather than claiming a save that didn't happen.
      state = .unsupported
      return
    }
    queued = true
    context = ShareContext(host: host, title: title, imageURL: nil)
    state = .importing(context)

    importer.run(
      url: url,
      onPreviewImage: { [weak self] imageURL in
        // The post's own photo, pulled from the page we just read. Arrives
        // mid-import and upgrades the sheet in place — the layout already
        // reserved the space, so nothing jumps.
        guard let self, !self.hasCompleted else { return }
        self.context.imageURL = imageURL
        if case .importing = self.state {
          self.state = .importing(self.context)
        }
      },
      completion: { [weak self] outcome in
        guard let self, !self.hasCompleted else { return }
        switch outcome {
        case let .imported(recipe):
          self.settle(.imported(self.context, self.named(recipe, fallback: title)))
        case let .duplicate(recipe):
          self.settle(.duplicate(self.context, self.named(recipe, fallback: title)))
        case .unsupported:
          // A page that will never yield a recipe. Drop it rather than ask the
          // user about the same dead post on every launch.
          self.discardQueued()
          self.state = .unsupported
        case .gated:
          // The link stays queued on purpose: upgrading and opening the app
          // resumes it through the existing /share-import screen.
          self.state = .gated
        case .fallback:
          self.fallBackToQueue()
        }
      }
    )
  }

  /// A card with no name reads as a bug. If the server returned an empty one,
  /// fall back to the post's own title, then to a plain statement of fact.
  private func named(_ recipe: SavedRecipe, fallback: String?) -> SavedRecipe {
    guard recipe.name.isEmpty else { return recipe }
    var patched = recipe
    let trimmed = fallback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    patched.name = trimmed.isEmpty ? "Recipe saved" : trimmed
    return patched
  }

  /// A terminal success. The queued copy has done its job, the sheet has said
  /// so, and both get out of the way.
  private func settle(_ terminal: ShareSheetState) {
    discardQueued()
    // Fires as the card lands, not when the request returned — the confirmation
    // the user feels should coincide with the one they see.
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    state = terminal

    // Only a genuine save gets the send-off. A duplicate saved nothing, so
    // flying something into the library would be a lie.
    if case .imported = terminal, !UIAccessibility.isReduceMotionEnabled {
      beginDispatch()
    } else {
      scheduleAutoDismiss()
    }
  }

  /**
   The send-off.

   TIMING IS THE WHOLE DESIGN HERE. The animation is not the point — the recipe
   name and its ingredient count are, and they need to be READ before anything
   moves. So the sequence spends more than half its budget standing still:

     0.00s  result lands, haptic, tick springs in
     1.20s  ── hold. the only part that matters to a user ──
     1.20s  name and counts fade toward the disc          (0.22s)
     1.42s  disc dissolves, capsule widens                (0.28s)
     1.70s  pull back left — anticipation                 (0.14s)
     1.84s  fires right, stretching                       (0.40s)
     1.92s  card collapses in its wake                    (0.30s)
     2.30s  extension completes

   Shortening the hold is what would make this overwhelming: the motion would
   start before the eye had landed on the name, and the whole thing would read as
   a flash rather than a confirmation followed by a send-off.

   Reduce Motion never reaches here — `settle` routes those users to the plain
   hold-and-dismiss instead.
   */
  private func beginDispatch() {
    let steps: [(DispatchPhase, TimeInterval)] = [
      (.converging, 1.20),
      (.capsule, 1.42),
      (.windUp, 1.70),
      (.launched, 1.84),
      (.cleared, 1.92),
    ]

    for (phase, at) in steps {
      DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
        guard let self, !self.hasCompleted else { return }
        self.dispatch = phase
      }
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 2.30) { [weak self] in
      self?.finish()
    }
  }

  /**
   The pre-existing behaviour, reached only when the direct import can't run.

   What the sheet promises has to depend on whether a notification was really
   posted. The user may have declined notifications for PlanNplate and an
   extension cannot ask — in that case the link still imports, just on their next
   launch, and the closing line says so rather than promising a tap that will
   never come.
   */
  private func fallBackToQueue() {
    state = .queued(context, hint: nil)

    ShareNotification.post(host: context.host, title: context.title, shareId: shareId) { [weak self] posted in
      guard let self, !self.hasCompleted else { return }
      // Re-reads the state rather than closing over it, so a race can't undo it.
      guard case let .queued(currentContext, _) = self.state else { return }
      self.state = .queued(
        currentContext,
        hint: posted
          ? "Tap the notification to add it now."
          : "We’ll add it next time you open PlanNplate."
      )
    }

    scheduleAutoDismiss()
  }

  private func discardQueued() {
    guard queued else { return }
    PendingShareQueue.remove(id: shareId)
    queued = false
  }

  // MARK: - Completion

  /**
   How long a result stays up before the sheet dismisses itself.

   Scaled to what there is to read. A success card now carries a photo, the
   recipe's name and its ingredient count — the 1.6s that was right for a bare
   "Saved" would flash past all of it. The queued card carries an instruction,
   which the user has to act on, so it gets longer still.

   All of them stay short enough not to be in the way of the app the user was
   actually using. Nobody shares a recipe in order to look at our sheet.
   */
  private func autoDismissDelay(for state: ShareSheetState) -> TimeInterval {
    switch state {
    case .imported, .duplicate: return 2.4
    case .queued: return 2.8
    default: return 1.8
    }
  }

  private func scheduleAutoDismiss() {
    let delay = autoDismissDelay(for: state)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      self?.finish()
    }
  }

  /**
   Completing the request more than once is a programmer error, and there are
   several racing routes to it: the auto-dismiss timer, a late import callback,
   and the buttons. The flag makes whichever arrives first the only one that
   counts.
   */
  private func finish() {
    guard !hasCompleted else { return }
    hasCompleted = true
    importer.cancel()
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }

  /// Undo — offered only in the queued state, where nothing has been imported
  /// yet. The link is in the queue and a notification may already be on screen,
  /// so backing out has to retract both; leaving the notification would invite
  /// the user to tap into an import that no longer exists.
  private func undo() {
    discardQueued()
    ShareNotification.withdraw(shareId: shareId)
    cancel()
  }

  private func cancel() {
    guard !hasCompleted else { return }
    hasCompleted = true
    importer.cancel()
    extensionContext?.cancelRequest(
      withError: NSError(domain: "app.plannplate.share", code: NSUserCancelledError)
    )
  }
}
