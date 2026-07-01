# Setting Up a New Project

Use this checklist when adding `@sil/app-release` to a product repo such as Mazzi, Luys, or Tiko.

## Goal

The product repo should own all app-specific configuration, content, screenshots, signing, Apple IDs, and launch hooks.

`@sil/app-release` should own only the reusable automation:

- validate apps
- generate screenshots
- generate 10 second promo videos
- archive and export iOS builds
- prepare App Store metadata for Fastlane Deliver
- upload builds, metadata, and screenshots

## Required Project Files

Add one root manifest:

```txt
release.config.json
```

Example:

```json
{
  "apps": [
    { "slug": "chess", "releaseConfig": "apps/chess/release/ios.json" },
    { "slug": "reversi", "releaseConfig": "apps/reversi/release/ios.json" }
  ]
}
```

Add one release config per app:

```txt
apps/<app>/release/ios.json
```

Add metadata JSON per locale:

```txt
apps/<app>/release/app-store/en-US.json
```

Recommended metadata shape:

```json
{
  "name": "Mazzi Chess",
  "subtitle": "Classic chess, offline",
  "promotional_text": "Play focused chess games against Mazzi.",
  "description": "A clean offline chess app with difficulty levels, undo, themes, and game history.",
  "keywords": "chess,board game,offline,strategy,mazzi",
  "release_notes": "Initial release.",
  "support_url": "https://example.com/support",
  "privacy_url": "https://example.com/privacy",
  "marketing_url": "https://example.com",
  "copyright": "2026 Sil van Diepen"
}
```

## Required Local Tools

For local validation, screenshots, videos, and release automation, the machine usually needs:

- Xcode
- Xcode command line tools
- iOS simulator runtimes used by the config
- Node.js 22 or newer
- XcodeGen, if the app uses `project.yml`
- FFmpeg for promo videos
- ImageMagick for generated title/card/CTA promo segments
- Fastlane for metadata and screenshot upload

Install common tools with:

```sh
brew install xcodegen ffmpeg imagemagick fastlane
```

## Required App Store Connect Setup

For build uploads, set these environment variables unless the app config overrides the names:

```sh
export APP_STORE_CONNECT_API_KEY_ID="..."
export APP_STORE_CONNECT_API_ISSUER_ID="..."
```

The current upload path uses `xcrun altool`. The private key must be configured in the normal App Store Connect API key location expected by Apple tooling.

Each app config also needs an App Store Connect Apple ID:

```json
{
  "appleId": "6785882144"
}
```

## Required App Test Hooks

The app should support deterministic launch hooks for screenshots and videos.

The release config can pass launch arguments:

```json
{
  "launchArgs": ["--ui-testing", "--screenshot", "settings"]
}
```

Or environment variables:

```json
{
  "env": {
    "MAZZI_SCREENSHOT": "1",
    "MAZZI_SCREENSHOT_ROUTE": "settings",
    "MAZZI_SCREENSHOT_LANGUAGE": "{appLanguage}"
  }
}
```

Environment keys are automatically prefixed with `SIMCTL_CHILD_` before launching the simulator app.

The app should use these hooks to:

- skip onboarding where needed
- select language
- select color mode
- open specific screens or sheets
- seed deterministic game state
- avoid network or account requirements

## First Commands

From the product repo root, run:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode preflight
```

For all apps:

```sh
npx @sil/app-release-all --mode preflight
```

Fix every missing requirement reported for the module you want to run.

Then run one module at a time:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode validate
npx @sil/app-release --config apps/chess/release/ios.json --mode screenshots
npx @sil/app-release --config apps/chess/release/ios.json --mode promo-video
npx @sil/app-release --config apps/chess/release/ios.json --mode archive
npx @sil/app-release --config apps/chess/release/ios.json --mode prepare-metadata
npx @sil/app-release --config apps/chess/release/ios.json --mode prepare-screenshots
```

After local output looks correct, upload explicitly:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode upload-build
npx @sil/app-release --config apps/chess/release/ios.json --mode upload-metadata
npx @sil/app-release --config apps/chess/release/ios.json --mode upload-screenshots
```

## Expected Output Layout

Screenshots default to:

```txt
artifacts/screenshots/<app>/screenshots/<version>/<device-slug>/*.png
```

Promo videos default to:

```txt
artifacts/videos/<app>/videos/<version>/*.mp4
```

Fastlane Deliver output defaults to:

```txt
artifacts/app-store/<app>/metadata/<locale>/*.txt
artifacts/app-store/<app>/screenshots/<locale>/*.png
```

Apps can override these paths in their config.

## Agent Handoff Prompt

Use this prompt when pointing another agent at a product repo:

```txt
Set up @sil/app-release for this repo.

Read /Users/silvandiepen/Repositories/_projects/app-release/docs/setup-new-project.md and docs/config-reference.md first.

Add release.config.json at the repo root.
For each iOS app, add apps/<app>/release/ios.json and apps/<app>/release/app-store/en-US.json.
Use app-owned launch args or SIMCTL_CHILD env hooks for deterministic screenshots.
Run preflight for every app and fix missing module requirements.
Do not move release logic into this repo; keep only config/content here.
```
