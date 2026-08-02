# Share to PlanNplate

Adds PlanNplate to the iOS and Android share sheets so a recipe can go straight from
Instagram, TikTok, YouTube, Pinterest, Safari or Chrome into the user's recipe library, without
copying and pasting a link.

The paste flow (`/import-recipe`) is unchanged and remains the fallback. This is a second **entry
point onto the same pipeline**, not a second pipeline.

---

## Why it is built this way

The single fact that shaped the design: **PlanNplate's importer is client-side JavaScript.**
`extractRecipeFromUrl` ([src/lib/recipeImport.ts](../src/lib/recipeImport.ts)) fetches the page from the
device with an iPhone Safari user-agent, cleans the HTML in JS, and sends the text to the `ai-chat`
edge function. Persistence — ingredient validation, meal-type classification, image re-hosting, the
store upsert — is JS too.

An iOS share extension is a separate process that cannot run any of that. Making it import
directly would have required either a Swift reimplementation of the parser (a second parser) or
moving the fetch server-side (server IPs get blocked by Instagram and TikTok far more often than a
phone on a residential connection — a regression for the flow that works today). Both were rejected.

So the iOS extension **captures and confirms**; the app finishes the import.

Getting the user back into the app is the other half of that. `NSExtensionContext.open` is public
API and is called, but it was **tested on device and answers `false`** — there is no supported way
for an extension to launch its containing app, and the `openURL`-through-the-responder-chain
workaround is not shipped here. So the extension posts a **local notification** instead
([ShareNotification.swift](../targets/share/ShareNotification.swift)); tapping it launches PlanNplate,
and `useShareTarget`'s existing foreground drain does the rest — no app-side wiring was needed to
make the tap work. Notification authorization is inherited from the app and an extension cannot
request it, so the sheet's closing line is written from what was actually posted: *"Tap the
notification to add it now"* or *"We'll add it next time you open PlanNplate."* Never a promise the
build can't keep.

Android has no such constraint: the app process *is* the share target, so the import runs
immediately.

---

## How a share travels

```
iOS share sheet
  └─ ShareViewController (targets/share/)
       ├─ SharedLinkExtractor.swift   validate: scheme, host, pick the best link
       ├─ ShareSheetView.swift        branded sheet: Saved, then dismisses itself
       ├─ PendingShareQueue.swift     write {id, url, subject, capturedAt} to the App Group
       └─ ShareNotification.swift     post "tap to add it" — the one-tap way back in
                                       ↓  (no tokens, no session, no user data)
Android share sheet
  └─ MainActivity  ACTION_SEND / text/plain   (launchMode=singleTask, exported=true)
       └─ PlanNplateShareTargetModule.kt      read EXTRA_TEXT, then STRIP the intent
                                       ↓
                       modules/plannplate-share-target  (one TS API, both platforms)
                                       ↓
              src/hooks/useShareTarget.ts   drain → distill → persist → navigate
                                       ↓
              src/lib/share/url-ingest.ts   ← also used by the paste field
                                       ↓
              src/lib/share/import-orchestrator.ts
                    │                    │
   extractRecipeFromUrl (existing) ──────┤
   persistImportedRecipe ────────────────┘  → store.addRecipe (existing upsert)
                                       ↓
                       src/app/share-import.tsx  →  Saved / Already in PlanNplate / recovery
```

### Files

| Area | Path |
|---|---|
| iOS extension | `targets/share/{expo-target.config.js, Info.plist, ShareViewController.swift, ShareSheetView.swift, SharedLinkExtractor.swift, PendingShareQueue.swift}` |
| Native bridge | `modules/plannplate-share-target/` |
| URL ingestion | `src/lib/share/url-ingest.ts`, `src/lib/recipe-source.ts` |
| Orchestration | `src/lib/share/import-orchestrator.ts`, `outcome.ts`, `types.ts` |
| Persistence | `src/lib/share/persist-imported-recipe.ts` (lifted from `import-review.tsx`) |
| Pending links | `src/lib/share/pending-share.ts` |
| Analytics | `src/lib/share/analytics.ts` |
| UI | `src/app/share-import.tsx`, `src/components/share/ShareImportSheet.tsx` |
| Runtime wiring | `src/hooks/useShareTarget.ts`, `src/app/_layout.tsx` |
| Config | `app.config.js` |

---

## Identifiers

| | Value |
|---|---|
| iOS app bundle id | `com.vibecode.planplate.8ctfq2` *(one `n` — as shipped)* |
| Share extension bundle id | `com.vibecode.planplate.8ctfq2.ShareExtension` |
| App Group | `group.com.vibecode.planplate.8ctfq2` |
| Keychain access group | **none — not required.** See below. |
| Android package | `ycom.plannplate.app` |
| URL scheme | `plannplate` |

The App Group identifier appears in four places and they must stay in step:
`app.config.js`, `targets/share/expo-target.config.js`, `targets/share/PendingShareQueue.swift`,
`modules/plannplate-share-target/ios/PlanNplateShareTargetModule.swift`.

---

## Authentication and pending imports

**No Keychain access group is needed, because no credential ever crosses a process boundary.**
The extension performs no authenticated work: it writes `{id, url, subject?, capturedAt}` to the
App Group and exits. Supabase sessions stay exactly where they are — in AsyncStorage, via the
client in [src/lib/supabase.ts](../src/lib/supabase.ts) — and were not migrated, which would have
risked signing out every existing user of a live build.

| State | Behaviour |
|---|---|
| Signed in | Import runs immediately on confirmation, through the existing authenticated path. |
| Signed out / guest | Link is retained **before** the user is sent anywhere. `/signup` → onboarding → the share sheet reopens automatically and resumes. |
| Session expires mid-import | Classified as `auth-expired`, presented as "Sign in to finish saving". Link retained, nothing partially saved. |
| Free-tier allowance spent | Same `useRecipeFeatureGate('import', …)` meter as pasting — sharing is not a paywall bypass. Link retained so upgrading resumes it. |

Pending links live in AsyncStorage under `plannplate.share.v1`. **Only the link is stored** — the
shared text is run through ingestion at collection time and the caption is discarded immediately.
Entries expire after **7 days**; the user can cancel; `reset()` wipes everything on sign-out.

### Idempotency — three layers

1. **Share id.** Minted natively at capture (`UUID` in Swift/Kotlin), checked against a bounded
   50-entry processed set. Covers an extension re-run, an Android intent redelivered after process
   death, and a React remount.
2. **Intent stripping / queue draining.** Android calls `removeExtra` and clears `clipData` the
   moment it reads; iOS truncates the App Group file on read. A rotation cannot replay a share.
3. **Content-level.** `findDuplicateBySourceUrl` on the canonical key, and `store.addRecipe`'s
   existing upsert ([recipe-identity.ts](../src/lib/recipe-identity.ts)) as the backstop.

A disabled button is not one of the layers.

---

## Failure matrix

Every reason maps to a category, wording from [copy.ts](../src/lib/failure/copy.ts), a retryability,
an analytics bucket and a keep-or-drop decision. Asserted in `share-outcome-map.test.ts`.

| Reason | Shown as | Retry? | Link kept? |
|---|---|---|---|
| `no-url` | We couldn't find a recipe link | no | dropped |
| `unsupported-scheme` / `blocked-host` | This link isn't supported yet | no | dropped |
| `payload-too-large` | We couldn't find a recipe link | no | dropped |
| `inaccessible` (private, deleted, login-walled, region/age-restricted, parser failure) | We couldn't access this recipe | no | dropped |
| `offline` (incl. DNS failure) | You're offline | yes | **kept** |
| `timeout` | That took longer than expected | yes | **kept** |
| `rate-limited` | Let's take a short break | no | **kept** |
| `unknown` | We couldn't save this recipe | yes | **kept** |
| auth missing/expired | Sign in to finish saving | — | **kept** |

Retryable failures keep the link so the user never has to go back to Instagram. Failures that will
produce the same answer forever drop it, so the app does not ask about the same dead post on every
launch.

---

## Analytics

Events (PostHog + dev sink; the Firebase allowlist in `firebase-analytics-policy.ts` returns `null`
for all of them by design): `recipe_share_target_opened`, `_payload_received`, `_url_detected`,
`_import_started`, `_import_succeeded`, `_import_failed`, `_duplicate_detected`, `_cancelled`,
`_auth_required`, `_opened_in_app`.

Properties: `platform`, `os_version`, `entry_point`, `source_domain`, `source`, `cold_start`,
`auth_state`, `duration_ms`, `result`, `retryable`.

`src/lib/share/analytics.ts` is the only builder of these properties and it accepts a **hostname,
never a URL**. Captions, full links, tokens and response bodies never reach a sink.

---

## Apple Developer setup

Do these once, before the first iOS build. All at
<https://developer.apple.com/account/resources>.

1. **Identifiers → `+` → App Groups → Continue.**
   Description: `PlanNplate Share`. Identifier: `group.com.vibecode.planplate.8ctfq2`.
   Continue → Register.
2. **Identifiers → `+` → App IDs → App → Continue.**
   Description: `PlanNplate Share Extension`. Bundle ID: **Explicit** →
   `com.vibecode.planplate.8ctfq2.ShareExtension`.
   Under Capabilities tick **App Groups**. Continue → Register.
3. **Identifiers → `com.vibecode.planplate.8ctfq2` → Capabilities → App Groups → Edit** →
   tick `group.com.vibecode.planplate.8ctfq2` → Continue → Save.
4. **Identifiers → `…​.ShareExtension` → Capabilities → App Groups → Edit** → tick the same group →
   Continue → Save.
5. **Apple Team ID — done.** `KP2T42YA49` (Hey Living Club Pty Ltd) is committed in
   `app.config.js`. It is not a secret — it ships inside every IPA — and it has to be in the config
   rather than the shell because EAS evaluates the config on its own build servers. Set
   `APPLE_TEAM_ID` in the environment to override it for a different team.
6. **Provisioning.** Run `eas credentials -p ios` and let EAS create/refresh profiles for **both**
   bundle identifiers, or accept the prompts on the next build.

> **Verify the App Group before building.** On the Identifiers page, switch the top-right filter
> from *App IDs* to *App Groups* and confirm `group.com.vibecode.planplate.8ctfq2` is listed. If it
> is missing or spelled differently, `containerURL(forSecurityApplicationGroupIdentifier:)` returns
> nil at runtime, the extension cannot hand the link over, and the sheet reports
> "This link isn't supported yet" with no other clue as to why.

App Store review: the extension ships inside the app binary, so there is no separate submission.
It requests no permissions and collects no data. The activation rule is narrow (web URLs and text
only), which is what keeps PlanNplate out of the share sheet for photos and documents.

## Google Play setup

**No console configuration is required** — the intent filter is compiled into the AAB.

Internal testing: Play Console → *Testing → Internal testing → Create new release* → upload the
artifact from `eas build -p android --profile production` → add testers → *Review and roll out*.

## EAS build commands

> **iOS builds must disable capability syncing.**
> ```bash
> EXPO_NO_CAPABILITY_SYNC=1 eas build -p ios --profile preview
> ```
> Declaring the App Group in `ios.entitlements` turned that key into the *authoritative*
> capability list as far as EAS is concerned. It contains no `com.apple.developer.applesignin`
> — correctly, because Apple sign-in here runs through `expo-auth-session`'s web flow and
> needs no such entitlement — so EAS tries to switch **Sign In with Apple off** on the App ID.
> Apple rejects that (the App Store app references the bundle) and reports it as
> `The bundle '99WJFBDLMC' cannot be deleted`, which is its API being unhelpful; nothing is
> being deleted.
>
> Turning the sync off is the right answer rather than a workaround: its only job is to mirror
> config entitlements into the developer console, and the App Groups capability is already set
> there by hand. The entitlement is still written into the binary either way.
>
> The trade-off: capabilities added via config from now on won't be auto-enabled on the App ID,
> so enable them in the console when you add one.

```bash
eas build -p ios --profile development-device
```

```bash
eas build -p android --profile preview
```

```bash
eas build -p ios --profile production && eas submit -p ios
```

```bash
eas build -p android --profile production
```

`development` (simulator) builds are fine for the Android intent filter but **cannot** exercise the
iOS share extension end-to-end — use `development-device` or TestFlight. Expo Go cannot load either
the extension or a custom intent filter.

---

## Device test checklist

Neither platform's share sheet can be exercised from a Windows workstation, so **none of the
following has been run** — they need the builds above on physical hardware. Record the result
against each row rather than assuming.

For each source: **Safari/Chrome · Instagram · TikTok · YouTube · Facebook · Pinterest · one
standard recipe site**

| # | Case | iOS | Android |
|---|---|---|---|
| 1 | PlanNplate appears in the share sheet for a link | ☐ | ☐ |
| 2 | PlanNplate does **not** appear when sharing a photo or a PDF | ☐ | ☐ |
| 3 | App closed (cold start) | ☐ | ☐ |
| 4 | App backgrounded (warm start) | ☐ | ☐ |
| 5 | App already open and in the foreground | ☐ | ☐ |
| 6 | Signed in → recipe saved, the recipe opens by itself ~1s later | ☐ | ☐ |
| 6a | Notification arrives over the sharing app; tapping it lands on the recipe | ☐ | n/a |
| 6b | Notifications denied for PlanNplate → sheet says "next time you open", no banner | ☐ | n/a |
| 6c | Undo on the sheet → notification disappears, nothing imports | ☐ | n/a |
| 6d | Ignore the notification, open the app manually → still imports once | ☐ | n/a |
| 7 | Signed out → sign in → import resumes without re-sharing | ☐ | ☐ |
| 8 | Fresh install → signup → onboarding → share sheet appears afterwards | ☐ | ☐ |
| 9 | Share the same post twice → "Already in PlanNplate", one library row | ☐ | ☐ |
| 10 | Airplane mode → "You're offline", link kept, retry works | ☐ | ☐ |
| 11 | Private/deleted Instagram post → "We couldn't access this recipe" | ☐ | ☐ |
| 12 | Share a caption with no link → "We couldn't find a recipe link" | ☐ | ☐ |
| 13 | Cancel from the sheet → nothing saved, no re-prompt | ☐ | ☐ |
| 14 | Rotate the device mid-flow → no second import | n/a | ☐ |
| 15 | Kill the app from the recents list mid-import → link still pending | ☐ | ☐ |
| 16 | Free-tier allowance spent → paywall, link kept | ☐ | ☐ |
| 17 | VoiceOver / TalkBack reads each state change | ☐ | ☐ |
| 18 | Largest Dynamic Type / font scale → nothing clipped | ☐ | ☐ |
| 19 | Paste flow still imports normally (regression) | ☐ | ☐ |

---

## Known limitations

- **iOS still needs one tap to come back.** Apple offers no sanctioned way to launch the containing
  app from a share extension — `NSExtensionContext.open` was tried on device and returns `false`. The
  notification closes that gap to a single tap, but it cannot close it to zero.
- **Banner duration is the user's setting, not ours.** Settings → Notifications → PlanNplate →
  Banner Style. Missing the banner costs nothing: the link stays queued and imports on next open.
- **The notification usually shows the domain, not the dish.** It is posted the instant the link is
  queued, which beats the `og:title` lookup. Fixable by delaying the post ~1.2s — parked for the next
  build rather than spending one on it.
- **No notification permission, no shortcut.** An extension cannot request notification
  authorization, so a user who declined it for PlanNplate gets the original behaviour: the link is
  queued and imports on their next launch. The sheet tells them that instead of promising a banner
  that will never arrive.
- **Private and login-walled Instagram/Facebook posts cannot be imported.** The importer reads the
  public page. Nothing here changes that, and no UI claims otherwise.
- **Redirect depth is bounded by a 6s timeout, not a hop count** — React Native's `fetch` does not
  expose the redirect chain, only the final `response.url`, which is re-validated against the same
  host guards.
- **Geist is not available inside the iOS extension.** The app loads it at runtime via
  `@expo-google-fonts/geist`; bundling the files into the extension would slow a surface that must
  appear instantly. San Francisco at matching weights is used instead. Colours, spacing and radii
  are transcribed exactly.
- **Native changes cannot ship over the air.** Both platforms need a new store build.
- `targets/share/Info.plist` is committed deliberately. `@bacons/apple-targets` only writes its
  default when the file is absent, and its default activation rule is `TRUEPREDICATE` — which would
  put PlanNplate in the share sheet for every file type on the device. **Do not delete it.**

## Rollback

Set `FEATURE_FLAGS.shareToPlanNplate = false` in
[src/lib/feature-flags.ts](../src/lib/feature-flags.ts). The app then ignores incoming payloads and
never routes to `/share-import`. This is a JavaScript-only change and can ship in an ordinary
update; the OS-level entries remain but do nothing.

Full removal: revert the commit, `npx expo prebuild --clean`, new store build. No migration, no
schema change, nothing written to existing recipes — the flag path leaves the paste flow entirely
untouched.
