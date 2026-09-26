// Extends app.json with CI build metadata: versionCode from the Actions run number (so every test APK
// installs as an update) and build/commit info shown in the app and used by the updater.
module.exports = ({ config }) => {
  const build = Number(process.env.BUILD_NUMBER || 1);
  return {
    ...config,
    android: { ...config.android, versionCode: build },
    plugins: [...(config.plugins || []), './plugins/withReleaseSigning'],
    extra: { ...config.extra, build, commit: (process.env.GIT_SHA || 'dev').slice(0, 7) },
  };
};
