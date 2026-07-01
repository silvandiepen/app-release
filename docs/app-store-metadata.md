---
title: App Store Metadata
description: Metadata JSON format and Fastlane Deliver output.
order: 7
---

# App Store Metadata

Each app owns App Store copy in its product repo.

Recommended path:

```txt
apps/<app>/release/app-store/en-US.json
```

## JSON Shape

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

## Prepare Metadata

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode prepare-metadata
```

The CLI writes Fastlane Deliver-compatible files:

```txt
artifacts/app-store/<app>/metadata/<locale>/*.txt
```

## Upload Metadata

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode upload-metadata
```

This requires:

- `bundleId`
- `appleId`
- Fastlane
- metadata JSON files for every configured locale
