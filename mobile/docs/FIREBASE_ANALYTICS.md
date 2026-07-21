# Firebase Analytics measurement bridge

Firebase Analytics is intentionally a narrow Google Ads measurement bridge in
PlanNplate. PostHog remains the primary product analytics system and continues
to receive its existing event names and payloads. Firebase has no screen
tracking, autocapture, replay, touch tracking, or behavioural event forwarding.
The same strict event allowlist is active on iOS and Android. Web resolves to
an explicit no-op adapter.

## Required local file

Both Firebase service files must exist at the mobile project root:

```text
mobile/GoogleService-Info.plist
mobile/google-services.json
```

The Firebase iOS app in that plist must use the app's bundle identifier:
`com.vibecode.planplate.8ctfq2`. The Firebase Android app in the JSON file must
use the app's package name: `ycom.plannplate.app`. Both files are consumed
through Expo app config; do not edit generated files under `ios/` or `android/`.

## Why Expo Go cannot be used

`@react-native-firebase/analytics` contains native iOS/Android code that is not
compiled into Expo Go. Use an Expo development build, an EAS preview/release
build, or TestFlight. Adding or updating a Firebase native package or native
config requires a new native build; refreshing JavaScript alone is not enough.

## Builds

Install a physical-iPhone development build:

```sh
npx eas-cli build --platform ios --profile development-device
npx expo start --dev-client
```

Install an Android development build:

```sh
npx eas-cli build --platform android --profile development-device
npx expo start --dev-client
```

The existing simulator profile remains available on a Mac:

```sh
npx eas-cli build --platform ios --profile development
```

Create and submit the production/TestFlight build:

```sh
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production --latest
```

Create the production Android build:

```sh
npx eas-cli build --platform android --profile production
```

The EAS project must include both Firebase service files in the uploaded source.
The files are intentionally not generated or rewritten by the app.

## Firebase event contract

| Existing semantic success | Firebase event | Firebase parameters | Firing boundary |
| --- | --- | --- | --- |
| `auth_signup` | `sign_up` | `method` only (`email`, `google`, `facebook`, `apple`, or `unknown`) | After account creation/social authentication succeeds; existing users logging in do not emit it |
| `onboarding_completed` | `onboarding_complete` | None | After onboarding preferences are accepted and saved to app state |
| `meal_plan_created` | `meal_plan_created` | None | After a generated plan is placed in the store, a curated plan is applied, or background plan generation completes with at least one saved item |
| `purchase_completed` with an active RevenueCat entitlement whose verification did not fail and whose period is `TRIAL` | `trial_started` | `transaction_id`, `product_id`, `plan_id` | After RevenueCat returns the confirmed transaction and active trial entitlement |
| `purchase_completed` with an active RevenueCat entitlement whose verification did not fail and whose period is not `TRIAL` | `purchase` | `transaction_id`, `value`, `currency`, and a subscription item containing product/plan IDs | After RevenueCat returns the confirmed transaction and active paid entitlement |

Firebase transaction IDs are deduplicated for the running app session. Paywall
views, purchase button taps, cancellations, failed purchases, restores, logins,
recipe details, ingredient data, preferences, and screen views are not forwarded
to Firebase.

The Firebase user ID is set only to the authenticated user's internal UUID. It
is cleared for logged-out and anonymous sessions. Email, name, recipe text,
free-form text, and PostHog identity properties never enter the Firebase bridge.

Firebase may still produce its own SDK-managed lifecycle events such as
`first_open` or `session_start`. Automatic screen reporting is explicitly
disabled in `firebase.json`; the app does not call Firebase screen APIs.
Android sets both Firebase advertising-ID collection and default
ad-personalisation signals to false in the generated manifest. This is scoped
to Firebase and does not alter pre-existing SDK configuration. iOS links
Firebase Analytics without IDFA support.

## Validation

1. Confirm the resolved Expo config:

   ```sh
   npx expo config --type public
   ```

   It should show both service-file paths, the Firebase App and Analytics
   plugins, `withoutAdIdSupport: true`, on-device conversion enabled, the
   Android privacy plugin, static iOS frameworks, and
   `RNFBApp`/`RNFBAnalytics` static linking.

2. In a development build, exercise one success boundary at a time and open
   Firebase Console > Analytics > Realtime. Normal analytics delivery can be
   batched, while Realtime usually appears sooner.

3. For Firebase DebugView on iOS, run the development build from Xcode on a Mac
   and add `-FIRDebugEnabled` to the scheme's launch arguments. Remove it or add
   `-FIRDebugDisabled` after validation. TestFlight cannot be launched with an
   Xcode scheme argument, so use it to validate production behaviour rather
   than DebugView instrumentation.

   For Android, connect a development device and enable DebugView with:

   ```sh
   adb shell setprop debug.firebase.analytics.app ycom.plannplate.app
   ```

   Disable it afterward with:

   ```sh
   adb shell setprop debug.firebase.analytics.app .none.
   ```

4. At the same time, use PostHog Live Events to confirm that the original
   PostHog event names and payloads are still present. PostHog screen capture and
   existing PostHog identity behaviour should be unchanged.

5. Verify negative cases: login as an existing user, cancel a purchase, open the
   paywall, preview a generated meal plan without saving, and navigate between
   screens. None of these actions should produce a custom Firebase conversion.
