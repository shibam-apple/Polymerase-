# Test-only signing key

`test-release.jks` signs the test APKs published at the `test-latest` GitHub release, so each new build installs as an
update over the previous one. It is **public and test-only** (password `daily-test-only`): anyone can sign an APK with
it. Only install Daily builds from this repo's Releases page. Replace it with a private key, stored as a CI secret,
before any real use.
