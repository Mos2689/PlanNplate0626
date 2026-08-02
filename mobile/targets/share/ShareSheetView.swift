import SwiftUI

/**
 The PlanNplate sheet, as it appears inside another app's share sheet.

 Tokens are transcribed from `src/lib/design-tokens.ts` rather than approximated
 — an extension cannot reach the app's JavaScript, so this is the one surface
 where the palette has to be restated. Cream ground, warm near-black ink,
 terracotta reserved for the single primary action, sage for confirmation,
 generous negative space, 16pt corners, restrained shadow.

 Geist is loaded at runtime by the app (`@expo-google-fonts/geist`) and is not
 available to an extension process without bundling the files into this target,
 which would add weight to a surface that must appear instantly. San Francisco
 at matching weights is the honest substitute and reads as native here.

 Accessibility: Dynamic Type throughout (no fixed point sizes on body copy),
 44pt minimum targets, the whole state announced as one group, and a live
 announcement when the state changes so VoiceOver doesn't leave the user on a
 stale "Save to PlanNplate".
 */

/**
 There is no "Ready" state any more.

 The sheet used to ask the user to confirm a decision they had already made by
 choosing PlanNplate in the share sheet — two taps in our own surface for no
 information gained. Capturing a link is harmless and reversible, so it now
 happens on appear and the sheet reports what it did. `Undo` is the escape
 hatch, and it removes the queued item rather than just closing.
 */
enum ShareSheetState: Equatable {
  case loading
  /// `hint` says how the recipe actually gets added — by tapping the
  /// notification, or on the user's next launch if they've turned notifications
  /// off. It arrives a beat after the rest because an extension has to ask the
  /// system whether it's allowed to post one. See ShareViewController.
  case saved(host: String, title: String?, hint: String?)
  case unsupported
  case noLink
}

struct ShareSheetView: View {
  let state: ShareSheetState
  let onUndo: () -> Void
  let onCancel: () -> Void
  let onDone: () -> Void

  // MARK: Palette — src/lib/design-tokens.ts
  private let cream = Color(red: 0.980, green: 0.969, blue: 0.941)   // #FAF7F0
  private let ink = Color(red: 0.082, green: 0.078, blue: 0.059)     // #15140F
  private let ink2 = Color(red: 0.357, green: 0.349, blue: 0.314)    // #5B5950
  private let ink3 = Color(red: 0.604, green: 0.588, blue: 0.545)    // #9A968B
  private let hairline = Color(red: 0.925, green: 0.918, blue: 0.886) // #ECEAE2
  private let terracotta = Color(red: 0.894, green: 0.427, blue: 0.275) // #E46D46
  private let sage = Color(red: 0.329, green: 0.392, blue: 0.271)    // #546445

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)

      VStack(alignment: .leading, spacing: 20) {
        header
        content
        actions
      }
      .padding(24)
      .background(cream)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(hairline, lineWidth: 1)
      )
      .shadow(color: ink.opacity(0.10), radius: 24, x: 0, y: 8)
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.black.opacity(0.18).ignoresSafeArea())
    .accessibilityElement(children: .contain)
  }

  // MARK: - Sections

  private var header: some View {
    HStack(spacing: 10) {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(sage)
        .frame(width: 26, height: 26)
        .overlay(
          Text("P")
            .font(.system(size: 15, weight: .semibold, design: .default))
            .foregroundColor(cream)
        )
        .accessibilityHidden(true)
      Text("PlanNplate")
        .font(.subheadline.weight(.medium))
        .foregroundColor(ink2)
      Spacer()
    }
  }

  @ViewBuilder
  private var content: some View {
    switch state {
    case .loading:
      block(title: "Checking the recipe…", body: "This should only take a moment.")
    case let .saved(host, title, hint):
      VStack(alignment: .leading, spacing: 8) {
        Text("Saved to PlanNplate")
          .font(.title3.weight(.semibold))
          .foregroundColor(ink)
          .accessibilityAddTraits(.isHeader)
        if let title, !title.isEmpty {
          Text(title)
            .font(.subheadline)
            .foregroundColor(ink2)
            .lineLimit(2)
        }
        Text(host)
          .font(.footnote)
          .foregroundColor(ink3)
          .lineLimit(1)
        if let hint {
          Text(hint)
            .font(.footnote)
            .foregroundColor(sage)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 2)
        }
      }
      .accessibilityElement(children: .combine)
    case .unsupported:
      block(
        title: "This link isn’t supported yet",
        body: "Try importing the recipe link directly in PlanNplate."
      )
    case .noLink:
      block(
        title: "We couldn’t find a recipe link",
        body: "Try sharing the post again, or paste its link in PlanNplate."
      )
    }
  }

  private func block(title: String, body: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.title3.weight(.semibold))
        .foregroundColor(ink)
        .accessibilityAddTraits(.isHeader)
      Text(body)
        .font(.subheadline)
        .foregroundColor(ink2)
        .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder
  private var actions: some View {
    switch state {
    case .loading:
      EmptyView()
    case .saved:
      VStack(spacing: 10) {
        primaryButton("Done", action: onDone)
        // Not "Cancel" — the link is already saved, and saying otherwise would
        // misdescribe what the button does. Undo removes it from the queue.
        secondaryButton("Undo", action: onUndo)
      }
    case .unsupported, .noLink:
      secondaryButton("Close", action: onCancel)
    }
  }

  private func primaryButton(_ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label)
        .font(.body.weight(.semibold))
        .foregroundColor(cream)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(terracotta)
        .clipShape(Capsule())
    }
    .accessibilityLabel(label)
  }

  private func secondaryButton(_ label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label)
        .font(.body.weight(.medium))
        .foregroundColor(ink2)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .accessibilityLabel(label)
  }
}
