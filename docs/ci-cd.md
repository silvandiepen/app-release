---
title: CI/CD
description: GitHub Actions setup for package checks and releases.
order: 8
---

# CI/CD

This repo uses GitHub Actions for package checks and release artifacts.

## CI

The CI workflow runs on pushes and pull requests:

- Node syntax checks
- example preflight
- all-app example preflight
- docs build smoke test with `npx girky`

## Releases

The release workflow runs on:

- tags matching `v*`
- manual `workflow_dispatch`

It creates:

- an npm package tarball with `npm pack`
- a GitHub release for tags
- an npm publish when `NPM_TOKEN` is configured

## Required Secrets

For npm publishing:

```txt
NPM_TOKEN
```

The workflow still builds the package artifact when `NPM_TOKEN` is not set.

## Docs Website

The docs are Markdown files in `/docs` and are intended for Girk.

Netlify can build the docs site with:

```sh
cd docs && npx girky
```

The generated site is written to:

```txt
docs/public
```
