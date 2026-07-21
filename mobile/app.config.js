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

  config.ios = {
    ...config.ios,
    googleServicesFile: "./GoogleService-Info.plist",
  };

  config.android = {
    ...config.android,
    googleServicesFile: "./google-services.json",
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
