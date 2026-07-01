---
title: CLI Modes
description: Commands exposed by app-release and app-release-all.
order: 4
---

# CLI Modes

Run one app:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode preflight
```

Run all apps from `release.config.json`:

```sh
npx @sil/app-release-all --mode screenshots
```

## Modes

- `preflight`: report paths, config status, upload readiness, and module requirements.
- `validate` / `verify`: run the configured validation command or script.
- `screenshots`: build the simulator app and capture screenshots.
- `site-screenshots`: capture screenshots into `site/public/screenshots/apps/<app>`.
- `promo-video`: generate a 10 second promo video.
- `archive`: create an Xcode archive and optional IPA export.
- `upload-build`: upload an IPA with `xcrun altool`.
- `prepare-metadata`: convert metadata JSON into Fastlane Deliver text files.
- `upload-metadata`: upload metadata with Fastlane Deliver.
- `prepare-screenshots`: copy screenshots into Fastlane Deliver layout.
- `upload-screenshots`: upload screenshots with Fastlane Deliver.
- `distribute`: upload build, metadata, and screenshots.
- `all`: validate, screenshots, archive, prepare metadata, and prepare screenshots.

## Common Flags

- `--config <path>`: app release config path.
- `--mode <mode>`: mode to run. Defaults to `all`.
- `--output <path>`: override screenshot or video output root.
- `--skip-validate`: skip validation in `all`.
- `--upload`: in `all`, also upload build, metadata, and screenshots.
- `--dry-run`: print commands and check config without running side-effect commands.

## Multi-App Flags

- `--app chess`: run one app from the manifest.
- `--apps chess,reversi`: run a subset of apps.
- `--manifest release.config.json`: use a custom manifest.
- `--output-root artifacts/release`: place per-app output under a shared root.
