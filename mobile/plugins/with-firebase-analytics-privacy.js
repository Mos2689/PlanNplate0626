const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
} = require('@expo/config-plugins');

const pkg = require('../package.json');

/**
 * Keep Firebase Analytics acquisition-only on Android. These generated
 * manifest values disable advertising-ID collection and default
 * ad-personalisation signals specifically within Firebase Analytics.
 */
const withFirebaseAnalyticsPrivacy = (config) =>
  withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'google_analytics_adid_collection_enabled',
      'false',
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'google_analytics_default_allow_ad_personalization_signals',
      'false',
    );

    // Add tools:replace="android:value" to avoid manifest merger conflicts with firebase analytics package
    if (!manifestConfig.modResults.manifest.$['xmlns:tools']) {
      manifestConfig.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    
    if (application['meta-data']) {
      application['meta-data'].forEach((item) => {
        if (
          item.$['android:name'] === 'google_analytics_adid_collection_enabled' ||
          item.$['android:name'] === 'google_analytics_default_allow_ad_personalization_signals'
        ) {
          item.$['tools:replace'] = 'android:value';
        }
      });
    }

    return manifestConfig;
  });

module.exports = createRunOncePlugin(
  withFirebaseAnalyticsPrivacy,
  'with-firebase-analytics-privacy',
  pkg.version,
);
