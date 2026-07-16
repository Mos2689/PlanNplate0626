# Social authentication setup

The app uses Supabase Auth as the session authority for Google, Facebook, and
Apple. All providers return to the same PKCE callback:

```text
plannplate://auth/callback
```

Provider secrets must be stored in Supabase or the provider console. Never add
them to `EXPO_PUBLIC_*`, `app.json`, `app.config.js`, or `eas.json`.

## Supabase dashboard

1. Open Authentication > URL Configuration.
2. Add `plannplate://auth/callback` to Redirect URLs. Keep existing email and
   website redirects.
3. Under Authentication > Providers, enable Google, Facebook, and Apple after
   completing the provider-specific steps below.
4. Leave automatic identity linking enabled. Supabase automatically links a
   verified provider identity to an existing user with the same verified email,
   preserving the existing Supabase user ID and application data.
5. Do not enable manual identity linking for this release.

The Supabase provider callback used in all three external consoles is:

```text
https://plannplate.supabase.co/auth/v1/callback
```

Use the corresponding callback for a different Supabase project when building
staging or local environments.

## Google Cloud Console

1. Configure the OAuth consent screen and production branding.
2. Request only `openid`, `email`, and `profile` scopes.
3. Create an OAuth 2.0 **Web application** client.
4. Add the Supabase HTTPS callback above as an authorized redirect URI.
5. Copy the Web client ID and client secret into the Google provider settings
   in Supabase.
6. Complete Google verification before moving the consent screen to production
   if the console requires it.

This browser/PKCE implementation does not use a native Android Google client,
so `google-services.json`, `GoogleService-Info.plist`, reversed client-ID URL
schemes, and SHA fingerprints are not required. They become required if the app
is later migrated to a native Google authentication SDK.

## Meta Developer Console

1. Add Facebook Login to the existing Meta app.
2. Add the Supabase HTTPS callback above to Valid OAuth Redirect URIs. It must
   match exactly.
3. Confirm `email` and `public_profile` permissions are available.
4. Add developer/tester accounts and test while the Meta app is in Development
   mode.
5. Configure the production privacy-policy URL, terms URL, data-deletion URL,
   app domains, contact email, and required business verification.
6. Switch the app to Live only after production review is complete.
7. Copy the Meta App ID and App Secret into the Facebook provider settings in
   Supabase. The App Secret is different from the public Meta client token used
   by the analytics SDK and must never ship in the mobile app.

The existing native Facebook SDK configuration remains responsible for Meta
analytics. Supabase browser authentication coexists with it and does not require
another Android intent filter or iOS URL scheme.

## Apple Developer and Supabase

Sign in with Apple is displayed on iOS to satisfy the equivalent-login
requirement for apps that offer Google or Facebook as primary sign-in methods.

1. Enable Sign in with Apple for the App ID associated with bundle identifier
   `com.vibecode.planplate.8ctfq2`.
2. Create a Services ID for the web OAuth flow and associate it with the primary
   App ID.
3. Configure the Services ID website domain as
`plannplate.supabase.co` and its return URL as the Supabase HTTPS
   callback above.
4. Create a Sign in with Apple key and record the Team ID, Key ID, Services ID,
   and downloaded private key.
5. Generate the Apple client secret JWT and add the Services ID/client secret to
   the Apple provider settings in Supabase. Apple client-secret JWTs expire and
   must be rotated before expiry.
6. Test both a visible email and Apple's private relay email. Configure Apple's
   private email relay if transactional email must reach relay addresses.

## iOS and Android application configuration

- The existing Expo scheme is `plannplate`; no `app.json` change is required.
- iOS production builds must retain bundle identifier
  `com.vibecode.planplate.8ctfq2`.
- Android production builds must retain package `ycom.plannplate.app` and the
  existing `plannplate` deep-link intent filter.
- OAuth must be tested in a development/preview build or a signed production
  build. Expo Go cannot claim this custom scheme reliably.
- Reconcile the checked-in Android Gradle version/signing values with Expo/EAS
  configuration before producing a release APK/AAB. Release builds must not use
  the debug keystore.

## Required test matrix

- New account with each provider
- Existing password account with the same verified provider email
- Returning provider user
- Provider cancellation and denied consent
- Missing or hidden email
- Offline and interrupted callback
- Cold-start callback and foreground callback
- Logout followed by a different provider/account
- Existing onboarding data and RevenueCat identity after automatic linking
- Apple private relay email

Never merge different-email accounts automatically. If a user signs in with a
provider that supplies a different email, it is a separate account unless a
future, authenticated account-linking screen explicitly links the identity.

## Security follow-up before release

- Revoke and rotate the Resend key that was previously committed as
  `EXPO_PUBLIC_RESEND_API_KEY`. The client entry has been removed, but removing
  it from the current file does not invalidate a credential exposed in Git
  history or an older build.
- Store the replacement only as the Supabase Edge Function secret
  `RESEND_API_KEY`.
- Confirm no local or EAS environment still defines `EXPO_PUBLIC_RESEND_API_KEY`.
