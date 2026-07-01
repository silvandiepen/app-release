---
title: Agent Handoff
description: Instructions for another agent setting up app-release in a product repo.
order: 9
---

# Agent Handoff

Use this when asking another agent to set up `@sil/app-release` in a product repo.

```txt
Set up @sil/app-release for this repo.

Read these files first:
- /Users/silvandiepen/Repositories/_projects/app-release/docs/setup-new-project.md
- /Users/silvandiepen/Repositories/_projects/app-release/docs/config-reference.md

Add release.config.json at the repo root.
For each iOS app, add apps/<app>/release/ios.json.
For each app, add apps/<app>/release/app-store/en-US.json.

Use app-owned launch args or SIMCTL_CHILD environment hooks for deterministic screenshots.
Run preflight for every app and fix missing module requirements.

Do not move reusable release logic into this repo.
Only config, metadata, screenshots, app hooks, and signing/app identifiers belong in the product repo.
```

## Acceptance Criteria

- `npx -p @sil/app-release app-release-all --mode preflight` runs from the product repo.
- Every app has an app release config.
- Every app has App Store metadata JSON.
- Screenshot scenarios cover the required App Store screenshots.
- Promo video config totals 10 seconds.
- Missing dependencies are documented by preflight instead of discovered mid-run.
