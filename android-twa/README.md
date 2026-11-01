# Tordroid Plus Android app

A Trusted Web Activity (TWA) wrapper, generated with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap),
that opens https://plus.tordroid.com full-screen as the `com.tordroid.plus` app.

The signing key, its passwords and `local.properties` are **not** in this repository.

## Build

Needs JDK 17 and the Android SDK.

1. Create `local.properties` with `sdk.dir=<path to your Android SDK>`.
2. Bump `versionCode` / `versionName` in `app/build.gradle` (and `appVersionCode` / `appVersionName` in `twa-manifest.json`).
3. Build: `./gradlew assembleRelease bundleRelease`
4. Sign with the original upload key (the same key as earlier releases, so updates install over the old app):
   - APK: `zipalign -p 4` the unsigned APK, then `apksigner sign --ks signing.keystore --ks-key-alias my-key-alias`
   - AAB: `jarsigner -keystore signing.keystore <file>.aab my-key-alias`

The site serves `/.well-known/assetlinks.json` with the key's SHA-256 fingerprint, which lets the app open without a
browser bar. If the key ever changes, update that file in the web client too.
