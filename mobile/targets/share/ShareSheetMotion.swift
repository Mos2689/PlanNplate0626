import SwiftUI

/**
 The "we're working on it" motion, transcribed from the onboarding voice capture
 (`src/components/VoiceDishCapture.tsx`, the `thinking` phase).

 That screen solved the same problem this one has: a 2-5 second wait with nothing
 to show, which without motion reads as crashed. Its answer — and therefore ours
 — is that the disc IS the loading indicator: cooking icons drift through it on
 fixed slots, two arcs orbit outside at different speeds, rings breathe outward,
 and the copy advances so the wait feels narrated rather than endured.

 The numbers are copied, not re-invented, so the two surfaces feel like one
 product:

   ICON_SLOT_MS  900    one icon per slot, neighbours cross-fading
   ARC_OUTER_MS  2600   outer arc, clockwise
   ARC_INNER_MS  3800   inner arc, counter-clockwise
   RING_CYCLE_MS 2600   opacity 0.55 → 0, scale 0.72 → 1.28
   LINE_MS       1900   caption advance

 ONE CLOCK DRIVES EVERYTHING. `TimelineView` gives a single time source and each
 element derives its own phase from it — the same structure as the RN version's
 single `clock` shared value. Nothing mounts or unmounts mid-animation, which is
 what keeps the hand-off from the last icon back to the first seamless.

 REDUCE MOTION IS HONOURED. With it on, the timeline pauses and every element
 renders its resting state: a static disc, no arcs, no rings, and the first
 caption. The wait is still legible, it just doesn't move.
 */

// MARK: - Timings (mirrors VoiceDishCapture.tsx)

private enum Motion {
  static let iconSlot: Double = 0.9
  static let arcOuter: Double = 2.6
  static let arcInner: Double = 3.8
  static let ringCycle: Double = 2.6
  static let captionLine: Double = 1.9
}

/**
 Food glyphs for the carousel.

 SF Symbols rather than the app's lucide icons — bundling an icon font into an
 extension would add weight to a surface that must appear instantly, the same
 trade-off already made for Geist.

 **Every symbol here shipped in iOS 13-15**, which matters because the target
 deploys to 15.1: a symbol introduced later renders as an empty box on an older
 device rather than failing to build. The tempting ones (`frying.pan`,
 `cooktop`, `carrot`) are all iOS 16+ and are deliberately not used.
 */
private let cookingSymbols = [
  "fork.knife",          // iOS 13
  "flame.fill",          // iOS 13
  "leaf.fill",           // iOS 13
  "cup.and.saucer.fill", // iOS 15
  "timer",               // iOS 13
  "sparkles",            // iOS 14
]

/// Copy that advances while the server works. Written to describe what is
/// actually happening, in order, so a user who reads all three has learned how
/// the feature works rather than watched a spinner lie to them.
let importCaptions = [
  "Reading the post…",
  "Finding the ingredients…",
  "Almost there…",
]

// MARK: - Shared interpolation

/// Linear map with clamping — the equivalent of Reanimated's `interpolate` with
/// `Extrapolation.CLAMP`, which the RN original relies on throughout.
private func interpolate(_ x: Double, _ inputs: [Double], _ outputs: [Double]) -> Double {
  guard inputs.count == outputs.count, inputs.count >= 2 else { return outputs.first ?? 0 }
  if x <= inputs[0] { return outputs[0] }
  if x >= inputs[inputs.count - 1] { return outputs[outputs.count - 1] }
  for i in 0..<(inputs.count - 1) where x >= inputs[i] && x <= inputs[i + 1] {
    let span = inputs[i + 1] - inputs[i]
    guard span > 0 else { return outputs[i] }
    let t = (x - inputs[i]) / span
    return outputs[i] + t * (outputs[i + 1] - outputs[i])
  }
  return outputs[outputs.count - 1]
}

// MARK: - The working disc

/**
 The disc that stands in for progress.

 Two fills, one shape. When the shared page gave up an `og:image` the disc shows
 the actual dish and the motion orbits it; when it didn't, cooking icons drift
 through the disc instead. Either way the user is looking at something specific
 to what they shared rather than a generic spinner — which was the whole
 complaint about the old sheet.
 */
struct WorkingDisc: View {
  let theme: ShareSheetTheme
  let imageURL: URL?
  /// Freezes the motion and swaps in a confirmation mark.
  let settled: Bool

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private let size: CGFloat = 64

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion || settled)) { timeline in
      let t = timeline.date.timeIntervalSinceReferenceDate
      ZStack {
        if !settled && !reduceMotion {
          // Terracotta ring, and one arc of each: the two-tone orbit is what
          // stops the disc reading as a single flat colour spinning.
          PulseRing(tint: theme.accent, phase: phase(t, Motion.ringCycle), size: size)
          OrbitArc(tint: theme.brand, turns: phase(t, Motion.arcOuter), size: size + 22, sweep: 0.22, width: 2)
          OrbitArc(tint: theme.accent, turns: -phase(t, Motion.arcInner), size: size + 10, sweep: 0.16, width: 2)
        }

        disc(clock: t / Motion.iconSlot)
      }
      .frame(width: size + 26, height: size + 26)
    }
    .accessibilityHidden(true)
  }

  /// Position within a cycle, 0...1.
  private func phase(_ t: Double, _ period: Double) -> Double {
    (t.truncatingRemainder(dividingBy: period)) / period
  }

  @ViewBuilder
  private func disc(clock: Double) -> some View {
    ZStack {
      Circle()
        // SOLID terracotta, not a tint of it.
        //
        // This was a 10% wash with a 22% border, which is how you get a pastel
        // blob: at 64pt a tint that pale has no edge, no weight, and no colour
        // left to read. The disc is the one place in the sheet that gets to be
        // loud — it is the subject — so it carries the full brand terracotta and
        // the glyphs invert to white on top of it.
        .fill(imageURL == nil ? theme.accent : theme.surfaceMuted)
        // A border only earns its place over a photo, where it separates the
        // image from the ground. A solid fill already has an edge.
        .overlay(
          Circle()
            .stroke(theme.hairline, lineWidth: imageURL == nil ? 0 : 1)
        )

      if let imageURL {
        AsyncImage(url: imageURL) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          // The icons keep working until the photo lands, so the disc is never
          // an empty hole.
          CookingCarousel(theme: theme, clock: clock, frozen: reduceMotion || settled)
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
      } else {
        CookingCarousel(theme: theme, clock: clock, frozen: reduceMotion || settled)
      }

      if settled {
        // Springs in over whatever the disc is showing. Bottom-trailing so it
        // reads as a stamp on the result rather than part of the photo.
        Circle()
          .fill(theme.brand)
          .frame(width: 24, height: 24)
          .overlay(
            Image(systemName: "checkmark")
              .font(.system(size: 12, weight: .bold))
              .foregroundColor(.white)
          )
          .overlay(Circle().stroke(theme.ground, lineWidth: 2))
          .offset(x: size / 2 - 10, y: size / 2 - 10)
          .transition(.scale(scale: 0.4).combined(with: .opacity))
      }
    }
    .frame(width: size, height: size)
  }
}

/**
 One linear clock walks the icon list; each icon derives opacity, drift and scale
 from its distance to the clock, wrapped the short way round so the last-to-first
 hand-off is seamless. Transcribed from `CookingIcon` in VoiceDishCapture.tsx,
 including its interpolation stops.
 */
private struct CookingCarousel: View {
  let theme: ShareSheetTheme
  let clock: Double
  let frozen: Bool

  var body: some View {
    ZStack {
      ForEach(Array(cookingSymbols.enumerated()), id: \.offset) { index, symbol in
        let local = frozen ? (index == 0 ? 0 : 2) : wrapped(clock: clock, index: index)
        Image(systemName: symbol)
          // Semibold and white. Knocked out of the solid disc rather than
          // tinted on top of it, so the glyph reads at a glance instead of
          // dissolving into its own background.
          .font(.system(size: 24, weight: .semibold))
          .foregroundColor(.white)
          .opacity(interpolate(local, [-1, -0.34, 0.34, 1], [0, 1, 1, 0]))
          .offset(y: interpolate(local, [-1, 0, 1], [13, 0, -13]))
          .scaleEffect(interpolate(local, [-1, 0, 1], [0.7, 1, 0.7]))
      }
    }
  }

  /// Distance from the clock to this icon's slot, wrapped the short way round.
  private func wrapped(clock: Double, index: Int) -> Double {
    let count = Double(cookingSymbols.count)
    var local = clock.truncatingRemainder(dividingBy: count) - Double(index)
    let half = count / 2
    if local > half { local -= count }
    if local < -half { local += count }
    return local
  }
}

/// An arc segment orbiting the disc. Two of these at different periods,
/// directions AND colours is what gives the wait its sense of machinery.
private struct OrbitArc: View {
  let tint: Color
  let turns: Double
  let size: CGFloat
  /// Fraction of the circle the stroke covers.
  let sweep: Double
  let width: CGFloat

  var body: some View {
    Circle()
      .trim(from: 0, to: sweep)
      // Full strength. A 55% stroke on a 2pt arc is a grey smudge with a hint
      // of hue — the orbit has to be a definite object, not a suggestion.
      .stroke(tint, style: StrokeStyle(lineWidth: width, lineCap: .round))
      .frame(width: size, height: size)
      .rotationEffect(.degrees(turns * 360))
  }
}

/**
 Expanding ring, scaling 0.72 → 1.28 once per cycle.

 It starts at FULL opacity and fades to nothing. The RN original opens at 0.55,
 which is right there — it pulses out of a pale mint disc. Here it leaves a solid
 terracotta one, so anything less than full strength reads as a smudge detaching
 from the edge rather than a ring leaving it.
 */
private struct PulseRing: View {
  let tint: Color
  let phase: Double
  let size: CGFloat

  var body: some View {
    Circle()
      .stroke(tint, lineWidth: 2)
      .frame(width: size, height: size)
      .scaleEffect(interpolate(phase, [0, 0.7, 1], [0.72, 1.28, 1.28]))
      .opacity(interpolate(phase, [0, 0.7, 1], [1, 0, 0]))
  }
}

// MARK: - Advancing caption

/**
 Copy that moves through `importCaptions` on the same 1.9s beat as onboarding.

 Cross-fades with a small vertical drift rather than cutting, so a glance that
 lands mid-transition still reads as one line changing rather than two lines
 fighting. With Reduce Motion on it holds the first line and never advances —
 changing text is motion too.
 */
struct AdvancingCaption: View {
  let theme: ShareSheetTheme
  let lines: [String]

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduceMotion)) { timeline in
      let t = timeline.date.timeIntervalSinceReferenceDate / Motion.captionLine
      let index = reduceMotion ? 0 : Int(t.truncatingRemainder(dividingBy: Double(lines.count)))
      Text(lines[min(index, lines.count - 1)])
        .font(.subheadline.weight(.medium))
        .foregroundColor(theme.ink2)
        .id(index)
        .transition(
          .asymmetric(
            insertion: .opacity.combined(with: .offset(y: 6)),
            removal: .opacity.combined(with: .offset(y: -6))
          )
        )
        .animation(.easeInOut(duration: 0.28), value: index)
    }
  }
}
