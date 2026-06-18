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
