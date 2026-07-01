---
title: Promo Videos
description: Build 10 second App Store promo videos from simulator captures and generated cards.
order: 6
---

# Promo Videos

Promo videos are 10 second compositions made from configured segments.

Supported segment types:

- `title`
- `card`
- `cta`
- `capture`

All segment durations must total 10 seconds.

## Example

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
