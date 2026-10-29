const { createRunOncePlugin, withProjectBuildGradle } = require('@expo/config-plugins');

const pkg = require('../package.json');

const MARKER = '// @generated with-google-mobile-ads-gradle-fix';

/**
 * Two Android build fixes for react-native-google-mobile-ads on this
 * project's toolchain (Expo 54 / RN 0.81 / Kotlin 2.1.20):
 *
 * 1. The library's app-json.gradle only sets `rootProject.ext.googleMobileAdsJson`
 *    when app.json is missing or has a "react-native-google-mobile-ads" root
 *    key; otherwise it sets a misspelled `googleAdsJson`. Some versions then
 *    read `googleMobileAdsJson` unguarded and Gradle fails with "Cannot get
 *    property 'googleMobileAdsJson'". Defaulting it to false sends the library
 *    down its "no app.json config" path; the AdMob app id still reaches the
 *    manifest through the library's Expo plugin.
 *
 * 2. play-services-ads 25.4 (and other recent Google libraries) ship Kotlin 2.3
 *    metadata, which Kotlin 2.1 refuses to read ("Module was compiled with an
 *    incompatible version of Kotlin"). Modules only call their public Java
 *    API, so skipping the metadata version check is safe; this is the same
 *    flag react-native-google-mobile-ads 17.2+ sets for itself.
 */
const withGoogleMobileAdsGradleFix = (config) =>
  withProjectBuildGradle(config, (gradleConfig) => {
    if (!gradleConfig.modResults.contents.includes(MARKER)) {
      gradleConfig.modResults.contents += `
${MARKER}
if (!rootProject.ext.has("googleMobileAdsJson")) {
  rootProject.ext.googleMobileAdsJson = false
}

allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
  }
}
`;
    }
    return gradleConfig;
  });

module.exports = createRunOncePlugin(
  withGoogleMobileAdsGradleFix,
  'with-google-mobile-ads-gradle-fix',
  pkg.version,
);
