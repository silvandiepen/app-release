---
title: App Release
description: Shared release automation for iOS app families.
order: 1
---

# App Release

`@sil/app-release` is shared release automation for app families.

It lets each product repo keep its own release config, App Store copy, screenshots, signing, Apple IDs, and launch hooks, while this package owns the repeatable release workflow.

## What It Does

- validates app projects
- captures App Store screenshots from simulator scenarios
- builds 10 second promo videos
- archives iOS apps and exports IPAs
- prepares App Store metadata for Fastlane Deliver
- uploads builds, metadata, and screenshots
- runs one app or all configured apps
- reports missing tools, config, files, and credentials per module before starting work

## Design Rule

The reusable automation lives here.

Product-specific content stays in the product repo:

- `release.config.json`
- `apps/<app>/release/ios.json`
- `apps/<app>/release/app-store/<locale>.json`
- app screenshot hooks
- app signing and App Store identifiers

## First Command

From a product repo:

```sh
npx -p @sil/app-release app-release-all --mode preflight
```

Preflight prints what is ready and what is missing for each module.

## Documentation

- [Setup a New Project](setup-new-project.md)
- [Config Reference](config-reference.md)
- [CLI Modes](cli-modes.md)
- [Screenshot Automation](screenshots.md)
- [Promo Videos](promo-videos.md)
- [App Store Metadata](app-store-metadata.md)
- [CI/CD](ci-cd.md)
- [Agent Handoff](agent-handoff.md)
