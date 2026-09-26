// Signs release builds with the committed test-only key (credentials/test-release.jks) so each CI build
// installs as an update over the previous one. See credentials/README.md.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE = `
        release {
            storeFile file('../../credentials/test-release.jks')
            storePassword 'daily-test-only'
            keyAlias 'daily-test'
            keyPassword 'daily-test-only'
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents;
    if (!g.includes("credentials/test-release.jks")) {
      g = g.replace(/signingConfigs\s*\{/, m => m + RELEASE);
      // Point the release build type at the new signing config (template uses the debug one).
      g = g.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
};
