# Learning Loop for YouTube

Chapter summaries, quizzes and quick facts for any YouTube video. Chrome extension (Manifest V3),
bring your own Gemini API key — no backend, no analytics.

## Screenshots

| | |
| --- | --- |
| ![A multiple-choice quick check over the paused video](screenshots/mcq.png) | ![The same check answered in your own words](screenshots/writeans.png) |
| A quick check at each chapter mark | …or answer in your own words |
| !["Did you know" fact pop-out](screenshots/popupfact.png) | ![The panel with the density switches](screenshots/rightpanel.png) |
| A fact pop-out while the video keeps playing | Start / stop, questions and facts per chapter |

## Features

- **Chapter summaries** — a short summary per chapter, with a rail to jump around.
- **Pause-and-quiz** — the video pauses at every chapter mark: multiple choice graded instantly, then
  one answer in your own words judged by Gemini.
- **Hints and rewatch** — progressive hints; a wrong answer explains itself and offers *Rewatch 4:12*.
- **Questions and facts per chapter** — *Fewer / Moderate / More* on both; longer chapters ask more.
- **"Did you know" pop-ups** — two to five facts a chapter, never pauses playback, one OK to close,
  each marked with a star on the timeline beforehand.
- **Keeps your place** — half-finished sets stay unfinished, rewinds re-offer them, progress survives
  a reload.

## Install

1. `bun install && bun run build`
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → `dist/`
3. Options (gear in the panel, or the toolbar icon) → paste a key from `aistudio.google.com/apikey`
   → **Test connection**

## Use

1. Open a YouTube video with captions and reload the tab once.
2. Press **Start learning** in the panel on the right.
3. Watch — the video pauses at each marked chapter; fact pop-ups appear on their own.
4. Adjust model, level, quiz frequency and both densities in options at any time.

## Development

```bash
bun run dev          # options page + panel preview at /dev.html
bun run build        # typecheck + all builds into dist/
bun run lint

bun run check:panel       # headless UI checks of the real panel
bun run check:sw          # service worker vs a mocked Gemini, no key needed
bun run check:transcript  # live YouTube: transcript read
bun run check:quiz-live   # live YouTube: the whole loop
bun run probe:yt          # transcript/chapter DOM dump
bun run icons             # regenerate public/icons/*.png
```

`bun run dev` → `http://localhost:5173/dev.html` is the fastest way to work on the UI: the real
panel against a fake YouTube page, seeded with `?v=myVideoId&seed=1` (no extension, no key).

## How it works

- The content script mounts the React panel in a shadow root and drives the `<video>`; the service
  worker is the only place that reads the API key and calls Gemini.
- The transcript comes from YouTube's own transcript panel, with a MAIN-world caption fallback.
- Gemini calls use structured JSON output, re-validated locally with Zod; results are cached in
  `chrome.storage.local` (LRU, 120 entries) and cached content is never regenerated.
- Only natural chapter crossings quiz — seeking and ads never do.

## Privacy

The key lives in `chrome.storage.local` and is read by the service worker alone. Network: YouTube
and `generativelanguage.googleapis.com` only. Permission: `storage`. Full policy in
[PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © 2026 7TIN — use, read, modify, share and teach freely, keeping the licence notice.
Please don't repackage it behind a paywall and sell it as your own (that line states intent, not an
extra licence restriction).
