import SwiftUI

/**
 The extension's palette, transcribed from `src/lib/design-tokens.ts`.

 An extension cannot reach the app's JavaScript, so this is the one surface where
 the palette has to be restated rather than imported. Values are copied exactly —
 LIGHT_THEME and DARK_THEME from design-tokens.ts, plus the two accents.

 **Dark mode is new here.** The sheet used to be cream unconditionally, which at
 night meant a slab of #FAF7F0 detonating over a dark Instagram. It now follows
 the system appearance.

 One honest limitation: the app has its own in-app theme toggle
 (`useColorScheme`), and an extension can't see that preference — only the
 system's. A user who has forced light mode inside PlanNplate while their phone
 is in dark mode will get a dark sheet. Publishing the preference through the App
 Group would fix it; it isn't worth the plumbing until someone notices.
 */
struct ShareSheetTheme {
  let ground: Color      // sheet background
  let ink: Color         // primary text
  let ink2: Color        // secondary text
  let ink3: Color        // tertiary / metadata
  let hairline: Color    // borders
  let surfaceMuted: Color // chips, the media well
  /// Sage. **Settled states only** — the confirmation tick, the queued hint.
  let brand: Color
  /// Terracotta. **Working states only** — the cooking icons, the inner orbit,
  /// the pulse ring, the disc's tint before a photo lands.
  ///
  /// The split is the point. Sage everywhere read herbal and, worse, flat: the
  /// sheet looked identical whether it was working or finished. Warm-while-
  /// cooking / sage-when-saved makes the palette carry the state, so the
  /// transition is legible at a glance without reading a word.
  let accent: Color

  static func resolve(_ scheme: ColorScheme) -> ShareSheetTheme {
    scheme == .dark ? .dark : .light
  }

  // LIGHT_THEME, on a milky white ground.
  //
  // The sheet used to sit on cream (#FAF7F0). That is the app's `surfaceMuted`
  // token — correct for a chip or a banner INSIDE a white screen, wrong for the
  // screen itself, and over Instagram it read as a yellowed card rather than a
  // system surface. #FCFCFA is the app's white `surface` warmed by a hair, which
  // is how iOS sheets read: white, but not clinical.
  //
  // Cream is still here — it just moved to where it belongs, as `surfaceMuted`
  // behind the source chip, where a warm tone reads as a deliberate accent
  // against the ground rather than as the ground being off.
  static let light = ShareSheetTheme(
    ground: Color(red: 0.988, green: 0.988, blue: 0.980),        // #FCFCFA
    ink: Color(red: 0.082, green: 0.078, blue: 0.059),           // #15140F
    ink2: Color(red: 0.357, green: 0.349, blue: 0.314),          // #5B5950
    ink3: Color(red: 0.604, green: 0.588, blue: 0.545),          // #9A968B
    hairline: Color(red: 0.925, green: 0.918, blue: 0.886),      // #ECEAE2
    surfaceMuted: Color(red: 0.957, green: 0.949, blue: 0.922),  // #F4F2EB (pill)
    brand: Color(red: 0.329, green: 0.392, blue: 0.271),         // #546445
    accent: Color(red: 0.894, green: 0.427, blue: 0.275)         // #E46D46
  )

  // DARK_THEME. `surface` for the ground rather than `bg`, because the sheet is
  // a card floating over another app rather than a screen.
  static let dark = ShareSheetTheme(
    ground: Color(red: 0.141, green: 0.141, blue: 0.141),        // #242424
    ink: .white,                                                  // #FFFFFF
    ink2: Color(red: 0.627, green: 0.627, blue: 0.627),          // #A0A0A0
    ink3: Color(red: 0.400, green: 0.400, blue: 0.400),          // #666666
    hairline: Color(red: 0.165, green: 0.165, blue: 0.165),      // #2a2a2a
    surfaceMuted: Color(red: 0.180, green: 0.173, blue: 0.157),  // #2e2c28
    brand: Color(red: 0.420, green: 0.478, blue: 0.341),         // #6B7A57
    accent: Color(red: 0.894, green: 0.427, blue: 0.275)         // #E46D46
  )
}
