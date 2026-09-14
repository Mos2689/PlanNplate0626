import SwiftUI

/**
 The PlanNplate sheet, as it appears inside another app's share sheet.

 WHAT THIS IS FOR. The user is in Instagram, looking at food, and has four
 seconds of dead time while we read the page and a model turns it into a recipe.
 The sheet's job in those four seconds is to prove we understood what they
 shared — not to spin. So it shows the post's own photo and title while it works,
 narrates what it is actually doing, and ends on the recipe's name with enough
 detail to be worth reading. Everything here is in service of that.

 Design language is transcribed from the app rather than invented: colours and
 spacing from `src/lib/design-tokens.ts` (see ShareSheetTheme), and the working
 motion from the onboarding voice capture's "thinking" phase (see
 ShareSheetMotion). An extension cannot reach the app's JavaScript, so these are
 the two surfaces where the system has to be restated.

 Geist is loaded at runtime by the app and is not available to an extension
 without bundling the files into this target, which would add weight to a surface
 that must appear instantly. San Francisco at matching weights is the honest
 substitute and reads as native here.

 Accessibility: Dynamic Type throughout (no fixed point sizes on body copy),
 44pt minimum targets, decorative motion hidden from VoiceOver, each state
 announced as one group, and Reduce Motion honoured by the motion layer.
 */

/// What the user shared, as much as we know of it at any moment.
///
/// `imageURL` arrives LATE and on purpose: it is pulled out of the page the
/// extension has already fetched, so it costs no extra round trip, but it lands
/// a second or two after the sheet first appears. The layout reserves its space
/// from the first frame so nothing jumps when it does.
struct ShareContext: Equatable {
  var host: String
  var title: String?
  var imageURL: URL?
}

/// The saved recipe, as reported by the `share-import` edge function.
///
/// The counts are the point. "Saved" alone is a receipt; "Cheesy Garlic Bread ·
/// 8 ingredients · 25 min" is evidence that something real was understood, and
/// it is what the user would otherwise have opened the app to check.
struct SavedRecipe: Equatable {
  var name: String
  var ingredientCount: Int
  var totalMinutes: Int
  var imageURL: URL?
}

/**
 There is no "Ready" state, and no "Done" button.

 The sheet used to ask the user to confirm a decision they had already made by
 choosing PlanNplate in the share sheet, and then — because the app had to run
 the import — to tap a notification as well. It now does the work and reports the
 result.

 `.imported` and `.duplicate` are terminal and dismiss themselves; the user's next
 action belongs to the app they were already in. `.queued` is the pre-existing
 fallback, reached only when the direct import can't run.
 */
enum ShareSheetState: Equatable {
  case importing(ShareContext)
  case imported(ShareContext, SavedRecipe)
  case duplicate(ShareContext, SavedRecipe)
  case queued(ShareContext, hint: String?)
  case gated
  case unsupported
  case noLink
}

/**
 The send-off, after a recipe has actually been saved.

 The card converges into its own disc, the disc stretches into a capsule and
 fires off to the right, and the card collapses in its wake. No arrow and no
 glyph: direction and speed come from the shape deforming, which is the whole
 idea — a literal arrow would say "sent away", and the recipe is not going away,
 it is arriving in the user's library.

 Ordered so the view can ask `dispatch >= .capsule` rather than matching every
 case, and the controller advances it one step at a time.

 **Only `.imported` dispatches.** A duplicate saved nothing, so flying something
 into the library would be a lie; it holds and dismisses quietly instead.
 */
enum DispatchPhase: Int, Comparable {
  /// The result, sitting still and readable. Where the timing is spent.
  case idle = 0
  /// Name and counts fade toward the disc.
  case converging
  /// The disc loses its content and widens into a solid capsule.
  case capsule
  /// A short pull back to the left. Anticipation is what stops the launch
  /// reading as a jolt — without it the capsule simply vanishes rightward.
  case windUp
  /// Fires right, stretching as it accelerates.
  case launched
  /// Card gone.
  case cleared

  static func < (a: DispatchPhase, b: DispatchPhase) -> Bool {
    a.rawValue < b.rawValue
  }
}

struct ShareSheetView: View {
  let state: ShareSheetState
  var dispatch: DispatchPhase = .idle
  let onUndo: () -> Void
  let onCancel: () -> Void

  @Environment(\.colorScheme) private var colorScheme

  private var theme: ShareSheetTheme { .resolve(colorScheme) }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      VStack(alignment: .leading, spacing: 18) {
        header
        content
        actions
      }
      .padding(22)
      .background(theme.ground)
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(theme.hairline, lineWidth: 1)
      )
      // The card's only separation now that the scrim is gone, and it has to
      // hold against arbitrary content — a bright recipe video, a dark kitchen.
      // Slightly heavier than it was when a dimmed backdrop was doing half the
      // work.
      .shadow(color: .black.opacity(colorScheme == .dark ? 0.5 : 0.20), radius: 30, x: 0, y: 12)
      .padding(.horizontal, 14)
      .padding(.bottom, 22)
      // The card leaves in the capsule's wake rather than after it, so the two
      // read as one gesture instead of two events.
      .opacity(dispatch >= .cleared ? 0 : 1)
      .scaleEffect(dispatch >= .cleared ? 0.94 : 1)
      .animation(.spring(response: 0.42, dampingFraction: 0.86), value: state)
      .animation(dispatchCurve, value: dispatch)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // No scrim. There used to be an 18% black wash here, dimming the host app
    // behind the card the way a modal would — except the container the system
    // wraps a share extension in is opaque, so it was not dimming Instagram at
    // all. It was tinting a grey slab, and the slab is most of the screen.
    //
    // The card provides its own separation with a border and a shadow. See
    // `makeContainerTransparent()` in ShareViewController for the other half.
    .accessibilityElement(children: .contain)
  }

  // MARK: - Header

  /// Brand on the left, source on the right. The source chip is what makes the
  /// sheet feel addressed to *this* share rather than generically mounted.
  private var header: some View {
    HStack(spacing: 10) {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(theme.brand)
        .frame(width: 26, height: 26)
        .overlay(
          Text("P")
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.white)
        )
        .accessibilityHidden(true)

      Text("PlanNplate")
        .font(.subheadline.weight(.semibold))
        .foregroundColor(theme.ink)

      Spacer(minLength: 8)

      if let host = currentHost {
        Text(host)
          .font(.caption.weight(.medium))
          .foregroundColor(theme.ink3)
          .lineLimit(1)
          .padding(.horizontal, 9)
          .padding(.vertical, 4)
          .background(
            Capsule().fill(theme.surfaceMuted)
          )
          .accessibilityLabel("Shared from \(host)")
      }
    }
  }

  private var currentHost: String? {
    switch state {
    case let .importing(context),
         let .imported(context, _),
         let .duplicate(context, _),
         let .queued(context, _):
      return context.host.isEmpty ? nil : context.host
    case .gated, .unsupported, .noLink:
      return nil
    }
  }

  // MARK: - Content

  @ViewBuilder
  private var content: some View {
    switch state {
    case let .importing(context):
      media(context: context, recipe: nil, settled: false) {
        VStack(alignment: .leading, spacing: 5) {
          AdvancingCaption(theme: theme, lines: importCaptions)
          if let title = context.title, !title.isEmpty {
            // The post's own words. Proof we're working on the right thing,
            // before there is a recipe name to show.
            Text(title)
              .font(.footnote)
              .foregroundColor(theme.ink3)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Saving your recipe from \(context.host)")

    case let .imported(context, recipe):
      media(context: context, recipe: recipe, settled: true) {
        VStack(alignment: .leading, spacing: 5) {
          Text(recipe.name)
            .font(.headline)
            .foregroundColor(theme.ink)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
          metaRow(recipe)
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Saved to PlanNplate. \(recipe.name). \(metaSpoken(recipe))")

    case let .duplicate(context, recipe):
      media(context: context, recipe: recipe, settled: true) {
        VStack(alignment: .leading, spacing: 5) {
          Text(recipe.name)
            .font(.headline)
            .foregroundColor(theme.ink)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
          Text("Already in your recipes")
            .font(.footnote)
            .foregroundColor(theme.ink3)
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel("Already in PlanNplate. \(recipe.name)")

    case let .queued(context, hint):
      media(context: context, recipe: nil, settled: true) {
        VStack(alignment: .leading, spacing: 5) {
          Text("Saved to PlanNplate")
            .font(.headline)
            .foregroundColor(theme.ink)
          if let title = context.title, !title.isEmpty {
            Text(title)
              .font(.footnote)
              .foregroundColor(theme.ink3)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
          }
          if let hint {
            Text(hint)
              .font(.footnote.weight(.medium))
              .foregroundColor(theme.brand)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.top, 1)
          }
        }
      }
      .accessibilityElement(children: .combine)

    case .gated:
      // Solid, because this one is asking for something. The two below are not.
      notice(
        symbol: "bolt.fill",
        tint: theme.accent,
        solid: true,
        title: "You've used your free imports",
        body: "We've kept this link. Upgrade in PlanNplate and it'll be added."
      )

    case .unsupported:
      notice(
        symbol: "link.badge.plus",
        tint: theme.ink2,
        solid: false,
        title: "This link isn't supported yet",
        body: "Try importing the recipe link directly in PlanNplate."
      )

    case .noLink:
      notice(
        symbol: "magnifyingglass",
        tint: theme.ink2,
        solid: false,
        title: "We couldn't find a recipe link",
        body: "Try sharing the post again, or paste its link in PlanNplate."
      )
    }
  }

  /**
   The animation used to ENTER each phase.

   Chosen per-step rather than one curve for the whole sequence, because the
   steps are doing opposite jobs: the wind-up decelerates, the launch
   accelerates. A single easing would make one of them feel wrong.
   */
  private var dispatchCurve: Animation {
    switch dispatch {
    case .idle:       return .easeOut(duration: 0.2)
    case .converging: return .easeIn(duration: 0.22)
    case .capsule:    return .spring(response: 0.3, dampingFraction: 0.78)
    case .windUp:     return .easeOut(duration: 0.14)
    // Ease-IN: slow off the mark, then gone. An ease-out launch looks like
    // something being dragged rather than something leaving under its own power.
    case .launched:   return .timingCurve(0.5, 0, 0.85, 1, duration: 0.4)
    case .cleared:    return .easeInOut(duration: 0.3)
    }
  }

  /// The disc-and-text row every contentful state shares, so the layout never
  /// reflows between "working" and "done" — only its contents change.
  private func media<Trailing: View>(
    context: ShareContext,
    recipe: SavedRecipe?,
    settled: Bool,
    @ViewBuilder trailing: () -> Trailing
  ) -> some View {
    HStack(alignment: .center, spacing: 14) {
      ZStack {
        WorkingDisc(
          theme: theme,
          // The recipe's final image wins once we have it: the server may have
          // re-hosted or resolved a better one than the page handed us.
          imageURL: recipe?.imageURL ?? context.imageURL,
          settled: settled
        )
        // Fades out UNDER the capsule rather than being replaced by it, so the
        // photo dissolves into the shape instead of popping.
        .opacity(dispatch >= .capsule ? 0 : 1)

        if dispatch >= .capsule {
          Capsule(style: .continuous)
            .fill(theme.accent)
            .frame(width: dispatch >= .capsule ? 104 : 64, height: 64)
            // Squash and stretch. The whole readability of the launch is here:
            // the shape elongates along its direction of travel and thins
            // across it, which is what makes 400ms read as fast rather than
            // abrupt.
            .scaleEffect(
              x: dispatch >= .launched ? 1.5 : 1,
              y: dispatch >= .launched ? 0.72 : 1
            )
            .offset(x: capsuleOffset)
            .opacity(dispatch >= .cleared ? 0 : 1)
        }
      }
      .frame(width: 90, height: 90)

      trailing()
        .opacity(dispatch >= .converging ? 0 : 1)
        .offset(x: dispatch >= .converging ? -16 : 0)

      Spacer(minLength: 0)
    }
  }

  /// Rest, a short pull back, then off the right edge of the card.
  private var capsuleOffset: CGFloat {
    switch dispatch {
    case .windUp: return -10
    case .launched, .cleared: return 340
    default: return 0
    }
  }

  /// "8 ingredients · 25 min" — omits either half rather than printing a zero.
  @ViewBuilder
  private func metaRow(_ recipe: SavedRecipe) -> some View {
    let parts = metaParts(recipe)
    if !parts.isEmpty {
      HStack(spacing: 6) {
        ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
          if index > 0 {
            Circle()
              .fill(theme.ink3)
              .frame(width: 3, height: 3)
          }
          Text(part)
            .font(.footnote)
            .foregroundColor(theme.ink2)
        }
      }
    }
  }

  private func metaParts(_ recipe: SavedRecipe) -> [String] {
    var parts: [String] = []
    if recipe.ingredientCount > 0 {
      parts.append("\(recipe.ingredientCount) ingredient\(recipe.ingredientCount == 1 ? "" : "s")")
    }
    if recipe.totalMinutes > 0 {
      parts.append("\(recipe.totalMinutes) min")
    }
    return parts
  }

  private func metaSpoken(_ recipe: SavedRecipe) -> String {
    metaParts(recipe).joined(separator: ", ")
  }

  /// The non-recipe outcomes. A symbol instead of a photo, because there is no
  /// recipe to picture and a disc would promise one.
  ///
  /// `solid` is the hierarchy: a state that wants the user to DO something gets
  /// a filled well with a knocked-out glyph, one that is merely reporting gets a
  /// quiet one. Tinting a glyph on a pale well, which is what both used to do,
  /// says neither.
  private func notice(
    symbol: String,
    tint: Color,
    solid: Bool,
    title: String,
    body: String
  ) -> some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: symbol)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(solid ? .white : tint)
        .frame(width: 40, height: 40)
        .background(Circle().fill(solid ? tint : theme.surfaceMuted))
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 5) {
        Text(title)
          .font(.headline)
          .foregroundColor(theme.ink)
          .fixedSize(horizontal: false, vertical: true)
        Text(body)
          .font(.footnote)
          .foregroundColor(theme.ink2)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
    }
    .accessibilityElement(children: .combine)
  }

  // MARK: - Actions

  @ViewBuilder
  private var actions: some View {
    switch state {
    case .importing, .imported, .duplicate:
      // Nothing to press. The sheet dismisses itself — putting a button between
      // the user and the app they were already using is the tap this whole
      // change exists to remove.
      EmptyView()

    case .queued:
      // Not "Cancel" — the link IS saved, and saying otherwise would misdescribe
      // what the button does. Undo removes it from the queue.
      secondaryButton("Undo", action: onUndo)

    case .gated, .unsupported, .noLink:
      secondaryButton("Close", action: onCancel)
    }
  }

  private func secondaryButton(_ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label)
        .font(.subheadline.weight(.semibold))
        .foregroundColor(theme.ink2)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(theme.surfaceMuted)
        )
    }
    .accessibilityLabel(label)
  }
}
