---
title: Screenshot Automation
description: How app screenshots are configured and captured.
order: 5
---

# Screenshot Automation

Screenshots are driven by app-owned scenarios. The CLI builds the simulator app, launches it with deterministic hooks, waits, and captures the screen.

## Required App Hooks

The app should support either launch arguments or simulator child environment variables.

Example environment:

```json
{
  "env": {
    "MAZZI_SCREENSHOT": "1",
    "MAZZI_SCREENSHOT_ROUTE": "settings",
    "MAZZI_SCREENSHOT_LANGUAGE": "{appLanguage}"
  }
}
```

The CLI prefixes keys with `SIMCTL_CHILD_` automatically.

## What Hooks Should Control

- onboarding state
- language
- color mode
- route or sheet
- deterministic game state
- difficulty or level
- account/network bypasses

## Output

By default screenshots go to:

```txt
artifacts/screenshots/<app>/screenshots/<version>/<device-slug>/*.png
```

The app config can override `screenshots.outputDir`.

## Preflight

Run this before capture:

```sh
npx @sil/app-release --config apps/chess/release/ios.json --mode preflight
```

The `screenshots` module reports missing Xcode projects, iOS directories, Xcode tools, and screenshot config.
