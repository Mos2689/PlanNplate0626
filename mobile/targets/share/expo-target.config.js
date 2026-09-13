/**
 * The iOS Share Extension target.
 *
 * `/ios` is gitignored — this project is Continuous Native Generation — so the
 * Xcode target cannot be committed and has to be produced at prebuild time.
 * `@bacons/apple-targets` is the config plugin that does that; it reads this
 * file, creates the PBX target, wires the entitlements and links the Swift
 * sources sitting next to it.
 *
 * VERIFY BEFORE BUILDING: this file's shape follows the plugin's documented
 * config, but the plugin's API has moved between releases and the installed
 * version is the source of truth. Run `npx expo prebuild --platform ios` and
 * open the generated project once before trusting a release build — see
 * docs/SHARE_TO_PLANNPLATE.md.
 *
 * Three identifiers must stay in step with app.config.js:
 *   • the App Group, which carries the captured link between the two processes
 *   • the Keychain access group, which carries the import credential — the link
 *     and the credential travel separately on purpose
 *   • the bundle identifier, which must be a child of the app's own
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'share',
  name: 'PlanNplateShare',
  // Must be a suffix of the main app's `com.vibecode.planplate.8ctfq2`, or
  // Apple refuses the pairing at signing time.
  bundleIdentifier: '.ShareExtension',
  deploymentTarget: '15.1',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.vibecode.planplate.8ctfq2'],
    // `$(AppIdentifierPrefix)` expands to the team prefix at build time. iOS
    // matches on the full prefixed string; a bare bundle id here matches nothing
    // and every Keychain read from the extension comes back empty, silently.
    'keychain-access-groups': ['$(AppIdentifierPrefix)com.vibecode.planplate.8ctfq2'],
  },
});
