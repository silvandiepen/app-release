---
title: Promo Videos
description: Build App Store promo videos from real app recordings, cursor overlays, simulator captures, and generated cards.
order: 6
---

# Promo Videos

Promo videos can be built in two ways:

- `recordings`: real app walkthroughs with configurable duration, launch hooks, cursor movement, and click indicators.
- `segments`: 10 second compositions made from simulator capture clips and generated cards.

Use `recordings` for product demos where the app should look like it is being used. Use `segments` for short game-style previews or simple card/capture/card compositions.

Run:

```sh
npx @sil/app-release --config apps/example/release/ios.json --mode videos
```

`promo-video`, `promo-videos`, and `videos` are equivalent modes.

## Recording Walkthroughs

Recording configs live in the product release JSON. App code should expose deterministic launch hooks; `@sil/app-release` owns the capture, timing, cursor/click overlay, rendering, and output paths.

```json
{
  "promoVideo": {
    "outputDir": "/Users/silvandiepen/Projects/example/videos",
    "outputLayout": "app-previews",
    "recordings": [
      {
        "id": "app-preview",
        "deviceName": "iPhone 17 Pro Max",
        "filename": "example-iphone-app-preview.mp4",
        "width": 1320,
        "height": 2868,
        "durationSeconds": 29,
        "startDelaySeconds": 0.5,
        "launchArgs": ["--promo-demo"],
        "cursor": {
          "size": 56,
          "clickSize": 112,
          "moves": [
            { "at": 0.3, "x": 0.5, "y": 0.86 },
            { "at": 2.3, "x": 0.82, "y": 0.91 },
            { "at": 7.6, "x": 0.45, "y": 0.42 }
          ],
          "clicks": [
            { "at": 2.35, "x": 0.82, "y": 0.91 },
            { "at": 7.65, "x": 0.45, "y": 0.42 }
          ]
        }
      }
    ]
  }
}
```

Coordinates can be absolute pixels or relative values from `0` to `1`. Cursor positions are interpolated between `moves` timestamps. Click indicators are composited over the recording at the configured times.

Set `cursor.enabled` to `false` when the recording should only show tap/click pulse indicators at action points, without a visible cursor moving between them.

For macOS apps, use the same shape with `platform: "macos"` in the app config and add a recording `filter` when the full screen capture needs cropping:

```json
{
  "promoVideo": {
    "recordings": [
      {
        "id": "app-preview",
        "device": { "name": "mac", "displayType": "mac" },
        "durationSeconds": 29,
        "filter": "crop=1280:800:619:269,scale=1920:-2,setsar=1",
        "env": { "EXAMPLE_PROMO_DEMO": "1" }
      }
    ]
  }
}
```

## Segment Compositions

Supported segment types:

- `title`
- `card`
- `cta`
- `capture`

All segment durations must total 10 seconds.

### Example

```json
{
  "promoVideo": {
    "deviceName": "iPhone 17 Pro Max",
    "width": 1290,
    "height": 2796,
    "segments": [
      { "type": "title", "durationSeconds": 1.2, "title": "Mazzi Chess", "subtitle": "Classic chess, offline." },
      { "type": "capture", "durationSeconds": 3.0, "scenarioId": "opening" },
      { "type": "card", "durationSeconds": 1.2, "title": "Eight levels", "subtitle": "From Noob to Grandmaster." },
      { "type": "capture", "durationSeconds": 3.0, "scenarioId": "settings" },
      { "type": "cta", "durationSeconds": 1.6, "title": "Mazzi Chess", "subtitle": "Available on the App Store" }
    ]
  }
}
```

## Dependencies

- FFmpeg is required.
- ImageMagick is required for generated title, card, and CTA clips.

Install:

```sh
brew install ffmpeg imagemagick
```

## Output

By default videos go to:

```txt
artifacts/videos/<app>/videos/<version>/*.mp4
```

Projects that keep App Store assets beside each app can use:

```json
{
  "promoVideo": {
    "outputDir": "/Users/silvandiepen/Projects/Mazzi/apps/chess/previews",
    "outputLayout": "app-previews",
    "locale": "en-US"
  }
}
```

That writes:

```txt
<outputDir>/<version>/<device>/*-<locale>.mp4
```
