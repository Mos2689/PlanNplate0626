module.exports = function ({ config }) {
  const metaAppId = process.env.EXPO_PUBLIC_META_APP_ID || "YOUR_META_APP_ID";
  const metaClientToken = process.env.EXPO_PUBLIC_META_CLIENT_TOKEN || "YOUR_META_CLIENT_TOKEN";
  const metaDisplayName = process.env.EXPO_PUBLIC_META_DISPLAY_NAME || "PlanNplate";

  if (!config.plugins) {
    config.plugins = [];
  }

  // Helper to check if a plugin is already registered
  const hasPlugin = (pluginName) => {
    return config.plugins.some((p) => {
      if (typeof p === "string") return p === pluginName;
      if (Array.isArray(p)) return p[0] === pluginName;
      return false;
    });
  };

  const upsertBuildProperties = () => {
    const pluginName = "expo-build-properties";
    const pluginIndex = config.plugins.findIndex((plugin) =>
      Array.isArray(plugin) ? plugin[0] === pluginName : plugin === pluginName,
    );
    const existingPlugin = pluginIndex >= 0 ? config.plugins[pluginIndex] : null;
    const existingOptions =
      Array.isArray(existingPlugin) && existingPlugin[1] ? existingPlugin[1] : {};
    const existingIos = existingOptions.ios || {};
    const forceStaticLinking = Array.from(
      new Set([
        ...(existingIos.forceStaticLinking || []),
        "RNFBApp",
        "RNFBAnalytics",
      ]),
    );
    const nextPlugin = [
      pluginName,
      {
        ...existingOptions,
        ios: {
          ...existingIos,
          useFrameworks: "static",
          forceStaticLinking,
        },
      },
    ];

    if (pluginIndex >= 0) {
      config.plugins[pluginIndex] = nextPlugin;
    } else {
      config.plugins.push(nextPlugin);
    }
  };

  // ── Share to PlanNplate ─────────────────────────────────────────────────
  // The only channel between the iOS share extension and the app. It must match
  // `targets/share/expo-target.config.js`, `targets/share/PendingShareQueue.swift`
  // and `modules/plannplate-share-target/ios/PlanNplateShareTargetModule.swift`.
  // Nothing sensitive travels through it — see the note in PendingShareQueue.swift.
  const shareAppGroup = "group.com.vibecode.planplate.8ctfq2";

  // The share extension imports recipes itself, which needs a credential — and a
  // credential must not travel through the App Group container (that carries the
  // link and nothing else, by design). It goes in the Keychain instead, in a
  // group both processes can reach.
  //
  // `$(AppIdentifierPrefix)` expands at build time to the team prefix with its
  // trailing dot. It is REQUIRED: iOS matches Keychain access groups on the full
  // prefixed string, and a bare bundle id matches nothing — silently, with every
  // read coming back empty. The runtime constant that has to agree with this is
  // SHARE_KEYCHAIN_ACCESS_GROUP in src/lib/share/import-token.ts.
  const shareKeychainGroup = "$(AppIdentifierPrefix)com.vibecode.planplate.8ctfq2";

  config.ios = {
    ...config.ios,
    googleServicesFile: "./GoogleService-Info.plist",
    // Signing an app extension needs the team explicitly — @bacons/apple-targets
    // warns and guesses without it, and the guess is what makes an extension
    // fail to sign.
    //
    // Committed rather than read from the shell: this config is evaluated on the
    // EAS build servers, where a local `export APPLE_TEAM_ID=…` doesn't exist.
    // A Team ID is not a secret (it ships inside every IPA), so there's nothing
    // to protect by keeping it out of the repo. The env var still wins, for
    // anyone building under a different team.
    appleTeamId: process.env.APPLE_TEAM_ID || "KP2T42YA49",
    entitlements: {
      ...config.ios?.entitlements,
      "com.apple.developer.applesignin": ["Default"],
      "com.apple.security.application-groups": Array.from(
        new Set([
          ...(config.ios?.entitlements?.["com.apple.security.application-groups"] ?? []),
          shareAppGroup,
        ]),
      ),
      "keychain-access-groups": Array.from(
        new Set([
          ...(config.ios?.entitlements?.["keychain-access-groups"] ?? []),
          shareKeychainGroup,
        ]),
      ),
    },
  };

  config.android = {
    ...config.android,
    googleServicesFile: "./google-services.json",
    intentFilters: [
      ...(config.android?.intentFilters ?? []),
      // Makes PlanNplate a share target. `text/plain` ONLY: it's what Chrome,
      // Instagram, TikTok, YouTube and Pinterest actually send, and registering
      // anything broader (`*/*`, image, video) would put PlanNplate in share
      // sheets for content the importer has no way to read.
      //
      // MainActivity is already `launchMode="singleTask"` and `exported="true"`,
      // so a share reaches `onNewIntent` on a running app and launches a cold
      // one — both handled in modules/plannplate-share-target.
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "text/plain" }],
      },
    ],
  };

  // Firebase is a deliberately narrow Google Ads measurement bridge. The
  // Analytics plugin excludes IDFA support while retaining Apple's on-device
  // conversion measurement capability. Android disables Firebase advertising-
  // ID collection and default ad-personalisation signals in its generated
  // manifest without changing other pre-existing SDKs. Event allowlisting
  // lives in src/lib/firebase-analytics-policy.ts.
  if (!hasPlugin("@react-native-firebase/app")) {
    config.plugins.push("@react-native-firebase/app");
  }
  if (!hasPlugin("@react-native-firebase/analytics")) {
    config.plugins.push([
      "@react-native-firebase/analytics",
      {
        ios: {
          withoutAdIdSupport: true,
          googleAppMeasurementOnDeviceConversion: true,
        },
      },
    ]);
  }
  if (!hasPlugin("./plugins/with-firebase-analytics-privacy")) {
    config.plugins.push("./plugins/with-firebase-analytics-privacy");
  }
  upsertBuildProperties();

  // 1. App Tracking Transparency plugin
  if (!hasPlugin("expo-tracking-transparency")) {
    config.plugins.push([
      "expo-tracking-transparency",
      {
        "userTrackingPermission": "This identifier will be used to deliver personalized ads to you."
      }
    ]);
  }

  // 3. iOS Share Extension target.
  // `/ios` is gitignored (Continuous Native Generation), so the Xcode target
  // can't be committed — this plugin generates it at prebuild from
  // targets/share/expo-target.config.js. The activation rule lives in the
  // committed targets/share/Info.plist, which the plugin leaves alone; its own
  // default for a share target is `TRUEPREDICATE`, which would put PlanNplate in
  // the share sheet for every file type on the device.
  if (!hasPlugin("@bacons/apple-targets")) {
    config.plugins.push("@bacons/apple-targets");
  }

  // Keep Android's three-button and gesture navigation areas visually joined
  // to the app surface. Without this, Android adds a semi-opaque system scrim
  // that reads as a harsh white band below warm screens such as auth.
  if (!hasPlugin("react-native-edge-to-edge")) {
    config.plugins.push([
      "react-native-edge-to-edge",
      {
        android: {
          parentTheme: "Default",
          enforceNavigationBarContrast: false,
        },
      },
    ]);
  }

  // Google AdMob — rewarded video for "watch ~30 s of ads, unlock Premium for
  // 7 days" (src/lib/rewarded-ad.ts). App ids are public (they ship in every
  // build), so they're committed like the Team ID above; env vars still win.
  // No userTrackingUsageDescription here: the ATT string stays the one from
  // app.json / expo-tracking-transparency. delayAppMeasurementInit lets the
  // consent step run before the SDK starts measuring.
  if (!hasPlugin("react-native-google-mobile-ads")) {
    config.plugins.push([
      "react-native-google-mobile-ads",
      {
        iosAppId:
          process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || "ca-app-pub-6516185368332110~6036431824",
        androidAppId:
          process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || "ca-app-pub-6516185368332110~2850941840",
        delayAppMeasurementInit: true,
        skAdNetworkItems: ["cstr6suwn9.skadnetwork"],
      },
    ]);
  }
  if (!hasPlugin("./plugins/with-google-mobile-ads-gradle-fix")) {
    config.plugins.push("./plugins/with-google-mobile-ads-gradle-fix");
  }

  // 2. Meta SDK configuration plugin
  if (!hasPlugin("react-native-fbsdk-next")) {
    config.plugins.push([
      "react-native-fbsdk-next",
      {
        "appID": metaAppId,
        "clientToken": metaClientToken,
        "displayName": metaDisplayName,
        "scheme": `fb${metaAppId}`,
        "advertiserIDCollectionEnabled": true,
        "autoLogAppEventsEnabled": true,
        "isAutoInitEnabled": true,
        "iosUserTrackingPermission": "This identifier will be used to deliver personalized ads to you."
      }
    ]);
  }

  return config;
};
