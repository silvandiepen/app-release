# Config Reference

This describes the app config consumed by:

```sh
app-release --config apps/<app>/release/ios.json
```

## Top-Level Fields

```json
{
  "app": "chess",
  "name": "Mazzi Chess",
  "scheme": "Chess",
  "project": "apps/chess/ios/Chess.xcodeproj",
  "iosDir": "apps/chess/ios",
  "productName": "Chess",
  "bundleId": "app.mazzi.chess",
  "appleId": "6785882144",
  "releaseVersion": "1.0.0"
}
```

- `app`: stable app slug, used for default paths.
- `name`: display name used by promo video defaults.
- `scheme`: Xcode scheme.
- `project`: `.xcodeproj` path, relative to the product repo root unless absolute.
- `iosDir`: directory where `xcodegen generate` and `xcodebuild` should run. Defaults to `apps/<app>/ios`.
- `productName`: simulator app product name. Defaults to `scheme`.
- `bundleId`: iOS bundle identifier.
- `appleId`: App Store Connect app Apple ID.
- `platform`: optional. `ios` (default) or `macos`. Selects the build/launch/capture pipeline. Omitting it keeps the existing iOS behavior, so other integrations are unaffected.
- `releaseVersion`: optional explicit output version. If omitted, the tool tries to read `MARKETING_VERSION` from `iosDir/project.yml`, then falls back to `unversioned`.

## Platforms

```json
{
  "platform": "macos"
}
```

- `ios` (default): builds for the iOS Simulator, launches with `xcrun simctl`, and captures with `simctl io screenshot`. Requires `iosDir`, XcodeGen, and a simulator.
- `macos`: builds for `platform=macOS`, launches the `.app` directly with launch args + environment, and captures each on-screen window with `screencapture`. Does not require a simulator, `iosDir`, or XcodeGen. Requires `xcodebuild` and `screencapture`.

Both platforms share the same `screenshots` config shape (devices, locales, color modes, scenarios, env, launch args). For `macos`, `screenshots.devices` defaults to `[{ "name": "mac", "displayType": "mac" }]` and env vars are passed to the app directly (no `SIMCTL_CHILD_` prefixing).

## Validation

```json
{
  "validation": {
    "command": "cd apps/chess/ios && xcodebuild test -scheme Chess -destination 'platform=iOS Simulator,name=iPhone 17 Pro'"
  }
}
```

Or:

```json
{
  "validation": {
    "script": "apps/chess/ios/scripts/validate-local.sh"
  }
}
```

- `command`: shell command run from the repo root.
- `script`: executable path run directly.

If neither is set, the default script is:

```txt
apps/<app>/ios/scripts/validate-local.sh
```

## Metadata

```json
{
  "metadata": {
    "sourceDir": "apps/chess/release/app-store",
    "locales": ["en-US"],
    "deliverDir": "artifacts/app-store/chess"
  }
}
```

- `sourceDir`: folder containing `<locale>.json` metadata files.
- `locales`: locale IDs to export.
- `deliverDir`: output root for Fastlane Deliver metadata.

Supported metadata JSON keys:

- `name`
- `subtitle`
- `promotional_text`
- `description`
- `keywords`
- `release_notes`
- `support_url`
- `privacy_url`
- `marketing_url`
- `copyright`

## Screenshots

```json
{
  "screenshots": {
    "outputDir": "artifacts/screenshots/chess",
    "configuration": "Debug",
    "quietBuild": true,
    "defaultWaitSeconds": 2,
    "eraseBeforeCapture": false,
    "scenarioBudgetPerDevice": 10,
    "baseLaunchArgs": ["--ui-testing"],
    "statusBar": {
      "time": "9:41",
      "wifiBars": 3,
      "cellularBars": 4,
      "batteryState": "charged",
      "batteryLevel": 100
    }
  }
}
```

- `outputDir`: base output folder. Final screenshots go under `screenshots/<version>`.
- `configuration`: Xcode build configuration. Defaults to `Debug`.
- `quietBuild`: pass `-quiet` to `xcodebuild`. Defaults to `true`.
- `defaultWaitSeconds`: default wait after app launch before capture.
- `eraseBeforeCapture`: erase simulator before capture.
- `scenarioBudgetPerDevice`: max screenshot jobs per device.
- `baseLaunchArgs`: launch args used for every screenshot scenario. Defaults to `["--ui-testing"]`.
- `statusBar`: values passed to `xcrun simctl status_bar override`.
- `windowAppearTimeoutSeconds`: macOS only. Seconds to wait for the app window to appear before capturing a window id. Defaults to `15`.

### Screenshot Devices

```json
{
  "devices": [
    {
      "name": "iPhone 17 Pro Max",
      "os": "26.2",
      "displayType": "APP_IPHONE_67",
      "createIfMissing": true,
      "udid": "optional-existing-simulator-udid",
      "simulatorName": "Mazzi Screenshots"
    }
  ]
}
```

- `name`: simulator device type name.
- `os`: iOS runtime version.
- `displayType`: App Store screenshot display type used for Deliver output names.
- `createIfMissing`: create the simulator if it does not exist. Defaults to true.
- `udid`: use an existing simulator directly.
- `simulatorName`: custom name when creating a simulator.

### Locales

```json
{
  "locales": [
    { "id": "en-US", "appLanguage": "en" }
  ]
}
```

String form is also supported:

```json
{
  "locales": ["en-US"]
}
```

### Color Modes

```json
{
  "colorModes": [
    {
      "id": "light",
      "launchArgs": ["--color-mode", "light"],
      "env": { "MAZZI_SCREENSHOT_COLOR_MODE": "light" },
      "userDefaults": { "colorMode": "light" }
    }
  ]
}
```

Color modes can add launch args, environment variables, and user defaults.

### Scenarios

```json
{
  "scenarios": [
    {
      "id": "settings",
      "filename": "02-{deviceSlug}-settings-{colorMode}.png",
      "enabled": true,
      "waitSeconds": 2,
      "launchArgs": ["--screenshot", "settings"],
      "env": { "MAZZI_SCREENSHOT_ROUTE": "settings" },
      "userDefaults": { "hasSeenOnboarding": true },
      "colorModes": ["light", "dark"],
      "locales": [{ "id": "en-US", "appLanguage": "en" }],
      "levels": [1, 2, 3],
      "levelLaunchArgs": ["--level", "{level}"]
    }
  ]
}
```

Template values supported in launch args, env, and filenames:

- `{locale}`
- `{appLanguage}`
- `{app}`
- `{colorMode}`
- `{scenario}`
- `{level}`
- `{device}`
- `{deviceName}`
- `{deviceSlug}`

## Promo Video

```json
{
  "promoVideo": {
    "deviceName": "iPhone 17 Pro Max",
    "width": 1290,
    "height": 2796,
    "outputDir": "artifacts/videos/chess",
    "outputLayout": "default",
    "locale": "en-US",
    "eraseBeforeCapture": false,
    "recordings": [],
    "segments": []
  }
}
```

- `deviceName`: screenshot device to use.
- `device`: inline device object if not using `deviceName`.
- `width` / `height`: rendered video size.
- `outputDir`: base video output folder. Final videos go under `videos/<version>`.
- `outputLayout`: `default` writes `videos/<version>/*.mp4`; `app-previews` writes `<version>/<device>/*-<locale>.mp4`.
- `locale`: locale suffix used by the `app-previews` filename. Defaults to `en-US`.
- `eraseBeforeCapture`: erase simulator before capture.
- `recordings`: real app walkthrough recordings with explicit durations.
- `segments`: card/capture compositions; must total 10 seconds.

Recording entries can set:

- `id`
- `deviceName` or `device`
- `filename`
- `width` / `height`
- `durationSeconds`
- `startDelaySeconds`
- `launchArgs`
- `env`
- `userDefaults`
- `filter` or `videoFilter` for FFmpeg scaling/cropping
- `cursor.moves` and `cursor.clicks`

Cursor coordinates can be absolute pixels or relative values from `0` to `1`.
Set `cursor.enabled` to `false` to render click indicators without a visible moving cursor.

Supported segment types:

```json
{ "type": "title", "durationSeconds": 1.2, "title": "Mazzi Chess", "subtitle": "Classic chess, offline." }
{ "type": "card", "durationSeconds": 1.2, "title": "Eight levels", "subtitle": "From Noob to Grandmaster." }
{ "type": "cta", "durationSeconds": 1.6, "title": "Mazzi Chess", "subtitle": "Available on the App Store" }
{ "type": "capture", "durationSeconds": 3.0, "scenarioId": "opening" }
```

Capture segments can also set:

- `locale`
- `colorMode`
- `level`
- `launchArgs`
- `env`
- `userDefaults`
- `startDelaySeconds`

## Archive

```json
{
  "archive": {
    "configuration": "Release",
    "archivePath": "/tmp/mazzi-chess/Chess.xcarchive",
    "exportPath": "/tmp/mazzi-chess/export",
    "ipaPath": "/tmp/mazzi-chess/export/Chess.ipa",
    "exportOptionsPlist": "apps/chess/ios/ExportOptions.plist",
    "allowProvisioningUpdates": false
  }
}
```

- `configuration`: Xcode build configuration. Defaults to `Release`.
- `archivePath`: target `.xcarchive` path.
- `exportPath`: IPA export folder.
- `ipaPath`: explicit IPA path.
- `exportOptionsPlist`: enables IPA export after archive.
- `allowProvisioningUpdates`: passes `-allowProvisioningUpdates`.

## Upload

```json
{
  "upload": {
    "ipaPath": "/tmp/mazzi-chess/export/Chess.ipa",
    "deliverDir": "artifacts/app-store/chess",
    "appleId": "6785882144",
    "apiKeyEnv": "APP_STORE_CONNECT_API_KEY_ID",
    "apiIssuerEnv": "APP_STORE_CONNECT_API_ISSUER_ID"
  }
}
```

- `ipaPath`: IPA to upload. Defaults to archive output.
- `deliverDir`: Fastlane Deliver output root.
- `appleId`: App Store Connect Apple ID. Falls back to top-level `appleId`.
- `apiKeyEnv`: environment variable containing the App Store Connect API key ID.
- `apiIssuerEnv`: environment variable containing the App Store Connect issuer ID.

## Multi-App Manifest

```json
{
  "apps": [
    { "slug": "chess", "releaseConfig": "apps/chess/release/ios.json" },
    { "slug": "reversi", "releaseConfig": "apps/reversi/release/ios.json" }
  ]
}
```

- `slug` or `id`: app identifier passed to `--app`.
- `releaseConfig` or `config`: path to the app release config.

Relative config paths resolve from the manifest file location.
