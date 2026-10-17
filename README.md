# Learning Loop for YouTube

A Chrome extension (Manifest V3) that turns any YouTube watch-page video into an interactive
learning experience: chapter summaries, pause-and-quiz moments, hints, "ask the video" Q&A with
clickable timestamps, free-text answer judging, and clearly-labelled fun facts for nature/science
videos.

**No backend.** Everything runs in the extension. You enter your own Gemini API key (stored in
`chrome.storage.local`), and transcript text / questions go directly from your browser to Google's
Gemini API. Nothing goes to the developer; no analytics.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Skeleton: manifest, build pipeline, shadow-DOM panel, SPA remount, Tailwind in shadow root | ✅ done |
| 2 | Transcript acquisition (Strategy A: transcript panel, Strategy B: player response) | ✅ done |
| 3 | Options page, service worker, Gemini client, `overview`, chapter rail | ⏳ next |
| 4 | Quiz flow: `chapterQuiz`, `judgeAnswer`, hints, pause/resume, ad handling | |
| 5 | Ask the video with timestamp citations | |
| 6 | Fun facts with grounding labels | |
| 7 | Polish: a11y, error states, performance, full README | |

## Development

```bash
bun install          # or npm install

npm run dev          # dev server: options page (/) + panel preview (/dev.html)

npm run typecheck    # tsc -b, strict mode
npm run build        # typecheck + all extension builds into dist/
npm run check:panel  # headless Chromium render checks of the real panel (see below)
npm run check:transcript  # end-to-end transcript checks on real YouTube (headless, needs network)
npm run probe:yt [url]    # diagnostic: dumps YouTube's live transcript/chapter DOM structure
npm run lint         # oxlint
npm run icons        # regenerates public/icons/*.png
```

### Load the extension unpacked

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Open any YouTube video (`https://www.youtube.com/watch?v=...`) and reload the tab once after
   installing. The panel appears at the top of the right column, above the related videos.

### Panel preview without the extension

`npm run dev` → open `http://localhost:5173/dev.html`. This mounts the real panel controller
against a fake YouTube shell (with a theme toggle), which is the fastest way to iterate on UI.

## Architecture notes

- **Content script** (`src/content/`): mounts the React panel inside a shadow root, watches
  YouTube's SPA navigation, follows YouTube's dark theme, controls the `<video>` element.
- **Service worker** (`src/background/`): the only place that reads the API key and calls Gemini —
  content-script fetches would be subject to the page's CORS and could leak the key into page
  context.
- **Build**: `vite.config.ts` builds the options page + service worker (ES module);
  `vite.config.content.ts` builds the content script as a single IIFE classic script with the
  Tailwind CSS inlined as a string (`?inline`) for shadow-root injection.

### Tailwind v4 inside a shadow root

Verified with a real headless render (`npm run check:panel`):

- `@property` rules declared **inside** a shadow stylesheet are ignored by Chromium. Tailwind v4
  ships ~33 of them, so the content script hoists every `@property` rule into `<head>` once
  (document-level registration reaches shadow trees).
- `:root` matches nothing inside a shadow tree. Tailwind 4.3.3 already emits theme variables as
  `:root,:host`, but the injected copy rewrites `:root` → `:host` anyway so any `:root`-only rule
  (ours or Tailwind's) keeps working.

### Transcript acquisition (Phase 2)

Verified against live YouTube on 2026-10-18 (`npm run check:transcript`, `npm run probe:yt`):

- **Strategy A (primary)** scrapes YouTube's own transcript panel: click
  `button[aria-label="Show transcript"]`, read `ytd-transcript-segment-renderer` rows
  (`.segment-timestamp` + `.segment-text`), then close the panel again if it was closed before.
  The trigger is server-rendered but its click handler attaches late, so the code re-clicks until
  the panel really opens. Segments render in bulk; a force-scroll loop guards against future
  lazy-loading layouts. The transcript section belongs to the video's metadata, not the player,
  so pre-roll ads don't block it.
- **Strategy B (fallback)** reads the caption tracks of the page's player response through a tiny
  MAIN-world bridge (`src/content/transcript-bridge.ts`, manifest `"world": "MAIN"`) over
  `window.postMessage` with origin + source + nonce checks. Reality check: YouTube now commonly
  answers the track `baseUrl` with **200 and an empty body** (no `pot` token), so Strategy B
  usually ends in a clearly-reported failure — Strategy A is the real workhorse. A guard avoids
  reading the ad's player response while `#movie_player.ad-showing`.
- Captions are merged into ~25s chunks, token-estimated (chars/4), and truncated at 250k tokens
  with a visible banner. Creator chapters are read from the description's macro-marker carousel
  (`#time` + `h3`).
- Videos with no captions at all (verified: Big Buck Bunny) end in a clear "No transcript
  available" state — never a crash, and never a Gemini call.

## Privacy

- API key: `chrome.storage.local` only (never `storage.sync`), never logged, never sent anywhere
  except Google's API in the `x-goog-api-key` header.
- Network: only `https://www.youtube.com/*` (page + transcript) and
  `https://generativelanguage.googleapis.com/*`.
- Permissions: `storage` only.
