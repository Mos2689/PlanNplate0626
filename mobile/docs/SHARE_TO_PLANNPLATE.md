# Share to PlanNplate

Adds PlanNplate to the iOS and Android share sheets so a recipe can go straight from
Instagram, TikTok, YouTube, Pinterest, Safari or Chrome into the user's recipe library, without
copying and pasting a link.

The paste flow (`/import-recipe`) is unchanged and remains the fallback. This is a second **entry
point onto the same pipeline**, not a second pipeline.

---

## Why it is built this way

**The extension fetches; the server parses and saves.** That split is the whole design, and it
exists because of two facts that pull in opposite directions.

The first: **a phone's IP address is an asset.** Instagram and TikTok block datacenter addresses far
more aggressively than a residential connection, so a backend that fetched the shared page itself
would import strictly fewer recipes than a phone doing it. The fetch has to stay on the device.

The second: **an iOS share extension is a separate process.** It has no React Native runtime, none of
the app's JavaScript, and — deliberately — no Supabase session. It cannot run
`extractRecipeFromUrl`, `validateIngredients` or `store.addRecipe`.

So the extension reads the page with an iPhone Safari user-agent
([RecipeImportClient.swift](../targets/share/RecipeImportClient.swift)) and posts the HTML to the
[`share-import`](../supabase/functions/share-import/index.ts) edge function, which does the parts that
need a secret or a database. The sheet shows "Saving your recipe…", then the recipe's name, then
dismisses itself. **One touch point: choosing PlanNplate.**

### What this replaced, and why

Until this change the extension could only **capture**; the app had to finish the import. That meant
getting the user back into the app, and `NSExtensionContext.open` — public API — was **tested on
device and answers `false`** for share extensions. There is no supported way for an extension to
launch its containing app. The workaround was a local notification the user had to tap, which made
saving a recipe a four-step flow **that saved nothing at all if they ignored the banner.**

The notification path still exists and is still correct — it is now the **fallback**, reached only
when the direct import can't run (signed out, offline, allowance spent, kill switch, server down).
In that case the link stays in the App Group queue and the app imports it on next open, exactly as
before. **No path through the extension can lose a user's link.**

Android has no such constraint: the app process *is* the share target, so the import has always run
immediately through the app's own pipeline, and none of this changed it.

### The sheet

The user is in Instagram, looking at food, and has four seconds of dead time. The sheet's job in
those four seconds is to prove we understood **what they shared** — not to spin.

- **While working:** the post's own photo (pulled from the `og:image` in the HTML the extension has
  already fetched, so it costs no extra round trip) beside the post's title, with copy that advances
  through what is actually happening — *Reading the post… → Finding the ingredients… → Almost there…*
- **On success:** the recipe's name and `8 ingredients · 25 min`. "Saved" alone is a receipt; the
  counts are evidence, and they are what the user would otherwise open the app to check.
- **Then it leaves**, on a timer scaled to how much there is to read (2.4s for a result, 2.8s for the
  queued card because that one carries an instruction).

Motion is transcribed from the onboarding voice capture's "thinking" phase
([VoiceDishCapture.tsx](../src/components/VoiceDishCapture.tsx)) rather than invented — same 900ms
icon slots, same 2600/3800ms counter-orbiting arcs, same 2600ms rings, same 1900ms caption beat — so
the two waits in the product feel like one system. `ShareSheetMotion.swift` carries those constants
with the RN originals named beside them.

Two constraints worth knowing before editing it:

- **SF Symbols only, and only ones that shipped by iOS 15.** The target deploys to 15.1, and a
  symbol introduced later renders as an empty box at runtime rather than failing the build. The
  obvious choices (`frying.pan`, `cooktop`, `carrot`) are all iOS 16+.
- **Dark mode follows the SYSTEM, not the app.** An extension can't see PlanNplate's in-app theme
  toggle. A user who forced light mode in-app on a dark-mode phone gets a dark sheet.

### What the server deliberately does NOT do

It does not normalise ingredient units or classify the meal type. Doing so would mean copying
`ingredient-validator` plus `ingredient-aliases`, `ingredient-unit-rules`, `ingredient-normalizer`
and the AU average-weight table into `_shared/` — roughly two thousand lines, mostly lookup tables,
in a second copy that nothing forces to stay in step with the first. When those drift, the grocery
list quietly aggregates a shared recipe differently from a pasted one and nothing fails loudly.

Instead the app normalises on arrival, through passes that already existed for exactly this purpose:
`loadUserData` re-validates every ingredient it fetches (store.ts), `reclassifySingleRecipe` fills a
missing meal-type tag, and `mergeRemoteRecipes` applies both to recipes picked up mid-session. One
implementation of each rule, shared by both entry points.

The same reasoning keeps the Pexels image search out of the server, and shapes how the recipe's photo
is found:

1. The extension reads `og:image` (or Instagram's JSON `display_url`) out of the page it already
   fetched — free, and early enough to show in the sheet while the import runs.
2. **If the page carries no image and it's an Instagram post, the extension fetches the public
   `/embed/captioned/` page.** That is the normal case for Instagram: the post URL is login-walled
   and hands a plain client nothing. It costs up to 4s, only on that path, and only when there would
   otherwise be no photo at all.
3. Whatever it found is posted to the function as `previewImageUrl`, which the function **prefers over
   its own extraction** — it could not reproduce step 2, because Instagram treats a datacenter
   address very differently from a phone.
4. The function re-hosts the result if it's an expiring Meta CDN URL, and falls back to the Unsplash
   placeholder only when every step above came up empty.

Step 2 mirrors `toInstagramEmbedUrl` / `resolveSourceImageUrl` in
[recipeImport.ts](../src/lib/recipeImport.ts) on purpose: sharing a post and pasting the same link
should resolve the same photo.

---

## How a share travels

```
iOS share sheet
  └─ ShareViewController (targets/share/)
       ├─ SharedLinkExtractor.swift   validate: scheme, host, pick the best link
       ├─ PendingShareQueue.swift     write {id, url, subject, capturedAt} to the App Group
       │                              ALWAYS FIRST — the safety net, removed only on success
       ├─ ShareImportConfig.swift     endpoint (App Group) + token (shared Keychain)
       ├─ RecipeImportClient.swift    fetch the page HERE, POST the HTML
       │        ↓
       │   supabase/functions/share-import
       │        token → user · entitlement · duplicate · extract · image · insert
       │        ↓
       ├─ ShareSheetView.swift        "Saving…" → "Saved — <name>" → dismisses itself
       └─ ShareNotification.swift     FALLBACK ONLY: posted when the import couldn't run
                                       ↓
      app, next foreground:  refreshSharedRecipes() → mergeRemoteRecipes()

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
| iOS extension | `targets/share/{expo-target.config.js, Info.plist, ShareViewController.swift, SharedLinkExtractor.swift, PendingShareQueue.swift, ShareNotification.swift}` |
| iOS direct import | `targets/share/{ShareImportConfig.swift, RecipeImportClient.swift}` |
| iOS sheet UI | `targets/share/{ShareSheetView.swift, ShareSheetTheme.swift, ShareSheetMotion.swift}` |
| Server | `supabase/functions/share-import/index.ts`, `_shared/{recipe-parser,recipe-source-url,ai-provider,share-entitlement}.ts` |
| Credential | `src/lib/share/import-token.ts`, `supabase/migrations/20260731120000_share_import_tokens.sql` |
| Import meter | `supabase/migrations/20260913120000_share_import_allowance.sql`, `db.syncImportAllowance`, `store.setImportAllowanceUsed` |
| Session setup | `src/lib/share/share-import-setup.ts` (called from `StoreHydration`) |
| Recipe top-up | `src/lib/share/refresh-shared-recipes.ts`, `db.fetchRecipesSince`, `store.mergeRemoteRecipes` |
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
| Keychain access group | `$(AppIdentifierPrefix)com.vibecode.planplate.8ctfq2` — carries the import token only |
| Android package | `ycom.plannplate.app` |
| URL scheme | `plannplate` |

The App Group identifier appears in four places and they must stay in step:
`app.config.js`, `targets/share/expo-target.config.js`, `targets/share/PendingShareQueue.swift`,
`modules/plannplate-share-target/ios/PlanNplateShareTargetModule.swift`.

---

## Authentication and pending imports

**The extension never holds a Supabase session, and the link and the credential travel separately.**

The App Group carries `{id, url, subject?, capturedAt}` and nothing else — no tokens, no user data.
The credential is a **share-import token**: 32 random bytes in the shared Keychain, of which the
server stores only a SHA-256 hash. It resolves to one user, authorises one action, and is revoked on
sign-out. Supabase sessions stay exactly where they are — in AsyncStorage, via the client in
[src/lib/supabase.ts](../src/lib/supabase.ts) — and were not migrated, which would have risked
signing out every existing user of a live build.

That distinction is the point: an extension is launched by arbitrary third-party apps with whatever
content they choose to hand it, so it is a much larger attack surface than the app. A session token
would open the whole account; this one can add a recipe.

The token is minted by `ensureShareImportToken` and revoked by `revokeShareImportTokens`, both wired
through [share-import-setup.ts](../src/lib/share/share-import-setup.ts) at the two moments
`StoreHydration` already knows about: user data loaded, and session cleared.

**`share-import` runs with `verify_jwt = false`** (see `supabase/config.toml`). It has to: the
gateway would reject a share-import token as a malformed JWT before the function ever ran. The
function does its own authentication and trusts nothing about its caller.

| State | Behaviour |
|---|---|
| Signed in | The extension imports directly. The recipe is saved before the sheet closes. |
| Signed out / guest | Link is retained **before** the user is sent anywhere. `/signup` → onboarding → the share sheet reopens automatically and resumes. |
| Session expires mid-import | Classified as `auth-expired`, presented as "Sign in to finish saving". Link retained, nothing partially saved. |
| Free-tier allowance spent | Same lifetime allowance as pasting — sharing is not a paywall bypass. Enforced **server-side** for the extension (see below). Link retained so upgrading resumes it. |

### The import meter

Every paywall counter in this app was local (`preferences.lifetimeFeatureUsage`, which
`upsertUserPreferences` has never written to the database). That was fine while a screen the client
controls was the only way to import. The extension isn't, so the server needs its own copy:

- `user_preferences.imports_used`, spent by `spend_import_allowance(user_id, limit)` — a single
  `UPDATE … WHERE imports_used < limit`, so two links shared at once can't both pass the same check.
  Refunded by `refund_import_allowance` when extraction then fails.
- Premium is resolved by asking **RevenueCat's REST API** directly, which works because
  `Purchases.logIn(userId)` uses the Supabase user id as the app_user_id. There is no subscription
  table or webhook in this project. Needs the `REVENUECAT_SECRET_KEY` function secret.
- `sync_import_allowance(count)` reconciles the two on each launch, taking the higher. Without it,
  every existing user who had already spent their imports locally would get a fresh ten the first
  time they shared — and a reinstall would clear the server's count.

**Anything the server can't determine fails open to the queue**, never to a block. Wrongly gating a
paying user is a support ticket; wrongly allowing one import is a rounding error.

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

   > **Keychain Sharing is NOT on this page, and does not need to be.** Searching the capability
   > list for it comes up empty, which is correct — unlike App Groups it requires no App ID
   > configuration at all. Every provisioning profile Apple issues already carries a
   > `keychain-access-groups` entry of `TEAMID.*`, so any group under the team prefix validates at
   > signing. The entitlement in `app.config.js` and `targets/share/expo-target.config.js` is the
   > whole configuration.
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

### Verify the entitlements before spending a build

Two entitlements have to reach the extension's binary, and a missing one fails *silently* — the
share just falls back to the queue, which looks like the feature never shipped. Prebuild on macOS,
then check the generated file:

```bash
npx expo prebuild --platform ios --clean && cat ios/.targets/PlanNplateShare/generated.entitlements
```

Note the **leading dot** in `.targets` — it is a hidden directory and `ls ios/` will not show it.
`@bacons/apple-targets` writes entitlements from the `entitlements` object in
`targets/share/expo-target.config.js` to that path and points `CODE_SIGN_ENTITLEMENTS` at it. It
must contain **both** `com.apple.security.application-groups` and `keychain-access-groups`.

> **Never create `targets/share/generated.entitlements` by hand.** The plugin treats a file of that
> name in the target's source directory as competing with the config object, warns, and ignores one
> of them. Keep the config object as the only source.

From Windows, `expo prebuild` refuses to generate iOS files at all. The config-level equivalent is
`npx expo config --type introspect`, which shows the resolved entitlements for both the app and the
share target — enough to catch a typo, not enough to prove the plugin wrote them.

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
| 6 | Signed in → sheet shows "Saving…" then "Saved — \<recipe name\>", dismisses itself, **no notification**, recipe is in the library on next open | ☐ | ☐ |
| 6a | Dismiss the sheet by hand mid-import → recipe still saved (`waitUntil`), exactly one row | ☐ | n/a |
| 6b | `SHARE_DIRECT_IMPORT_ENABLED` unset → every share falls back to queue + notification | ☐ | n/a |
| 6c | Undo in the fallback state → notification disappears, nothing imports | ☐ | n/a |
| 6d | Ignore the fallback notification, open the app manually → still imports once | ☐ | n/a |
| 6e | Revoke the token row in `share_import_tokens`, share → falls back; reopen the app → new token minted, next share imports directly | ☐ | n/a |
| 6f | Ingredients on a directly-imported recipe show canonical metric units after opening the app | ☐ | n/a |
| 6g | A directly-imported recipe appears under the right meal-type filter chip | ☐ | n/a |
| 6h | Airplane-mode the phone *after* the POST is sent → recipe still lands server-side | ☐ | n/a |
| 7 | Signed out → sign in → import resumes without re-sharing | ☐ | ☐ |
| 8 | Fresh install → signup → onboarding → share sheet appears afterwards | ☐ | ☐ |
| 9 | Share the same post twice → "Already in PlanNplate", one library row | ☐ | ☐ |
| 10 | Airplane mode → "You're offline", link kept, retry works | ☐ | ☐ |
| 11 | Private/deleted Instagram post → "We couldn't access this recipe" | ☐ | ☐ |
| 12 | Share a caption with no link → "We couldn't find a recipe link" | ☐ | ☐ |
| 13 | Cancel from the sheet → nothing saved, no re-prompt | ☐ | ☐ |
| 14 | Rotate the device mid-flow → no second import | n/a | ☐ |
| 15 | Kill the app from the recents list mid-import → link still pending | ☐ | ☐ |
| 16 | Free-tier allowance spent → sheet says so, link kept; upgrade + open app → resumes | ☐ | ☐ |
| 16a | Premium user → imports directly, `imports_used` does NOT move | ☐ | n/a |
| 16b | Existing user who had already spent their imports locally is NOT handed a fresh ten | ☐ | ☐ |
| 16c | Extraction fails after the meter was spent → `imports_used` is refunded | ☐ | n/a |
| 17 | VoiceOver / TalkBack reads each state change | ☐ | ☐ |
| 18 | Largest Dynamic Type / font scale → nothing clipped | ☐ | ☐ |
| 19 | Paste flow still imports normally (regression) | ☐ | ☐ |

---

## Known limitations

- **The recipe is saved, but the app still has to notice.** The extension writes straight to
  Postgres, so a running app doesn't know about it until `refreshSharedRecipes` runs on the next
  foreground. The user sees "Saved — \<name\>" immediately; the library row appears when they next
  open PlanNplate. Closing that gap properly needs a realtime subscription, which is not worth a
  socket for this.
- **The share sheet has no analytics.** An extension cannot reach the PostHog SDK, so the
  `recipe_share_*` events only cover the fallback path that goes through the app. Direct-import
  outcomes are visible in the edge function's logs and nowhere else. A server-side sink is the
  obvious follow-up.
- **The `og:title` preview lookup is gone.** It existed to put a dish name on a sheet that could only
  say "Saved"; the sheet now shows the real recipe name from the server. In the fallback state the
  title is whatever the sharing app provided (Instagram and TikTok both provide one).
- **Notifications are still the fallback's only shortcut, and still optional.** An extension cannot
  request notification authorization, so a user who declined it gets the link queued and imported on
  their next launch. The sheet says so rather than promising a banner that will never arrive. Banner
  duration is their setting (Settings → Notifications → PlanNplate → Banner Style), not ours.
- **Neither the extension nor the app can import a login-walled post.** Unchanged, and no UI claims
  otherwise.
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

## Server setup

Before the first build that includes the direct import:

1. **Apply the migrations.** `share_import_tokens` (committed 2026-07-31, quite possibly never
   pushed) and `share_import_allowance`. Check with `supabase migration list --linked` — do not
   assume, this project has a history of committed-but-unapplied migrations.
2. **Deploy the function.** `supabase functions deploy share-import`. It must go out with
   `verify_jwt = false`, which `supabase/config.toml` already declares.
3. **Set the secrets.**
   - `REVENUECAT_SECRET_KEY` — a RevenueCat **secret** API key, not the public SDK key. Without it
     every import falls back to the queue, because premium can't be determined.
   - `SHARE_DIRECT_IMPORT_ENABLED=true` — the direct import is **off until this is set**. That is
     deliberate: the function is safe to deploy before the app build that uses it.

## Rollback

**Server-side, no release needed:** unset `SHARE_DIRECT_IMPORT_ENABLED` (or set it to anything but
`true`). Every share then answers `fallback`, and the extension does exactly what it did before —
queue the link, post the notification, let the app import it. This is the lever to pull first,
because it reaches phones that already have the extension installed.

`FEATURE_FLAGS.shareToPlanNplate = false` in
[src/lib/feature-flags.ts](../src/lib/feature-flags.ts) still exists and still works, but note what
it can and cannot do: it stops the **app** ingesting payloads and routing to `/share-import`. It is
JavaScript, so it cannot stop a native extension from calling the server. The two levers are not
interchangeable — use the env var to disable the direct import, the flag to disable the feature.

Full removal: revert the commit, `npx expo prebuild --clean`, new store build. No migration, no
schema change, nothing written to existing recipes — the flag path leaves the paste flow entirely
untouched.
