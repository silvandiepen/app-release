# @sil/app-release

Shared release automation for iOS app families.

The package owns the repeatable release logic. Each product repo owns its own config, copy, screenshots, launch hooks, signing, Apple IDs, and output paths.

## Install

Use from a repo with `npx`:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode screenshots
npx @sil/app-release --config apps/chess/release/ios.json --mode promo-video
npx @sil/app-release --config apps/chess/release/ios.json --mode all
```

For local development:

```sh
node /Users/silvandiepen/Repositories/_projects/app-release/app-release.mjs --config apps/chess/release/ios.json --mode preflight
```

## All Apps

Add a repo-owned `release.config.json`:

```json
{
  "apps": [
    { "slug": "chess", "releaseConfig": "apps/chess/release/ios.json" },
    { "slug": "reversi", "releaseConfig": "apps/reversi/release/ios.json" }
  ]
}
```

Relative `releaseConfig` paths resolve from the manifest location. In normal product repos that means paths are usually relative to the repo root.

Then run:

```sh
npx @sil/app-release-all --mode screenshots
npx @sil/app-release-all --mode promo-video --apps chess,reversi
```

## Modes

- `preflight`: print paths, config status, upload readiness, and tool availability.
- `validate` / `verify`: run the configured app validation command.
- `screenshots`: build the simulator app and capture configured screenshots.
- `site-screenshots`: capture screenshots into `site/public/screenshots/apps/<app>`.
- `promo-video`: compose a 10 second promo/App Preview video.
- `archive`: create an Xcode archive and optional IPA export.
- `upload-build`: upload a configured IPA with `xcrun altool`.
- `prepare-metadata`: export repo-owned metadata JSON to Fastlane Deliver format.
- `upload-metadata`: upload metadata with Fastlane Deliver.
- `prepare-screenshots`: copy screenshots into Fastlane Deliver screenshot layout.
- `upload-screenshots`: upload screenshots with Fastlane Deliver.
- `distribute`: upload build, metadata, and screenshots.
- `all`: validate, screenshots, archive, prepare metadata, prepare screenshots.

Every runnable mode checks its own requirements before doing work. Missing tools, paths, environment variables, or config fields are reported per module, for example `screenshots`, `promo-video`, `archive`, or `upload-metadata`.

## Config Ownership

Keep config in the consuming repo.

Recommended per-app file:

```txt
apps/<app>/release/ios.json
```

The app config owns:

- Xcode project, scheme, bundle ID, product name.
- App Store Connect Apple ID.
- validation command.
- screenshot devices, locales, scenarios, color modes, launch args/env, and output folder.
- metadata source folder.
- promo video segments.
- archive/export/upload settings.

For a full setup checklist, use [docs/setup-new-project.md](docs/setup-new-project.md).
For every config field currently supported, use [docs/config-reference.md](docs/config-reference.md).

## Screenshot Hooks

Apps can be driven with launch args:

```json
{
  "launchArgs": ["--ui-testing", "--screenshot", "menu"]
}
```

Or simulator child environment variables:

```json
{
  "env": {
    "MAZZI_SCREENSHOT": "1",
    "MAZZI_SCREENSHOT_ROUTE": "settings"
  }
}
```

Keys are automatically prefixed with `SIMCTL_CHILD_` unless they already start with it.

## External Tools

Required for common local capture:

- Xcode command line tools
- XcodeGen, when projects are generated from `project.yml`
- iOS Simulator runtime

Required for promo videos:

- FFmpeg
- ImageMagick when using `title`, `card`, or `cta` segments

Required for uploads:

- Fastlane for metadata/screenshot upload
- App Store Connect API credentials for build upload
