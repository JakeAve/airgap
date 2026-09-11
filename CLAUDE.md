# Airgap — Claude Rules

## Project Overview

A PWA hosting simple two-player arcade games. No server: two devices exchange
"orders" directly by sound (ggwave) or by QR code, and the two channels are
interchangeable. Hosted on GitHub Pages under a project path, so every URL in
the app is relative.

User-facing setup lives in [README.md](./README.md). This file is for repo
standards and structure.

## Stack

- **Runtime / tooling:** Deno 2.x only. No Node, no npm scripts, no framework.
- **Language:** TypeScript throughout, browser-targeted (`lib: dom`), plus
  `deno.ns` for tests and scripts.
- **Build:** `deno bundle --platform browser` via `scripts/build.ts` → `dist/`
- **Sound:** `npm:ggwave` (types hand-written in `types/ggwave.d.ts`)
- **QR:** `npm:qr` (encode + decode, ESM, typed)
- **Tests:** `deno test`, colocated `*.test.ts`
- **Styles:** plain CSS with variables in `static/styles.css`

## Common Commands

```bash
deno task setup        # install git hooks (once)
deno task dev          # build + serve dist/ on :8000, rebuild on change
deno task build        # production build → dist/
deno task check        # fmt check + lint + type check
deno task test         # unit tests
deno task pre-commit   # check + test (also run by .githooks/pre-commit)
deno task pre-push     # check + test (also run by .githooks/pre-push)
```

Always run `deno task pre-commit` (or let the git hook run it) before
committing.

## Directory Map

- `static/` — copied verbatim into `dist/`: `index.html`, `styles.css`,
  `manifest.webmanifest`, `icons/`
- `src/main.ts` — app entry; bundled to `dist/main.js`
- `src/sw.ts` — service worker; bundled to `dist/sw.js`. `__BUILD_ID__` is
  replaced at build time so each build gets its own cache.
- `src/lib/` — pure, tested modules shared by every game
  - `protocol.ts` — wire protocol constants (version, frame layout, limits)
  - `bits/` — `BitWriter`, `BitReader`, `crc8`
  - `envelope/` — 5-byte message header codec (`encodeEnvelope`,
    `decodeEnvelope`)
  - `frames/` — `buildFrames`, `parseFrame`, `Reassembler`
  - `transports/sound/` — `SoundEncoder` (frame → float32 samples),
    `SoundDecoder` (samples → frames), `ggwave.ts` (module loader, shared
    parameters)
  - `transports/qr/` — `QrEncoder` (frames → module matrix), `QrDecoder` (RGBA
    image → frames), `rasterize.ts` (matrix → RGBA, used by tests and the screen
    adapter), `bytesAsText.ts`
  - planned: device adapters (speaker, microphone, screen, camera), a worker
    hosting both decoders, `link.ts`
- `src/games/<game>/` — planned: `codec.ts`, `logic.ts`, `ui.ts` per game
- `scripts/` — Deno scripts (`build.ts`, `dev.ts`)
- `types/` — hand-written declarations for untyped npm packages
- `.githooks/` — pre-commit and pre-push; enabled by `deno task setup`
- `.github/workflows/` — `ci.yml` (check, test, build on every push) and
  `pages.yml` (deploy `dist/` on push to `main`)

## Architecture

Games speak typed messages to a single `Link` (planned). The Link wraps them in
an envelope, splits the envelope into fixed-size frames, and hands frames to
whichever transport the user picked. Transports only move frames, so a receiver
can collect frames from sound and QR interchangeably and the reassembler does
not care which delivered them.

- **Envelope** (40 bits): version 3 | type 3 | gameId 6 | sessionId 12 | seq 6 |
  length 10, then the payload. Length is what trims frame padding.
- **Frame** (`FRAME_BYTES` = 16): header 2 bytes (msgId 4 | index 6 | total-1 6)
  | payload 13 | crc8. Up to 64 frames per message, so 832 bytes.
- **Sound:** ggwave in fixed-length payload mode, one frame per transmission,
  AUDIBLE_FASTEST by default with FAST as the fallback. Fixed-length mode has no
  start/end markers, so decoding is continuous; the CRC rejects false positives.
  Sending will loop the frame sequence until stopped; there is no back channel.
- **QR:** up to `QR_MAX_FRAMES_PER_CODE` (32) frames concatenated per code, byte
  mode with a latin1 text hook so bytes are not UTF-8 expanded. Longer messages
  cycle through several codes.
- Decoders will run in a Web Worker. An AudioWorklet forwards sample chunks; the
  camera loop posts ImageData. Both decoders share a `push(chunk)` interface
  returning an array of frames.

## Wire-protocol facts worth remembering

- ggwave's JS `encode` returns float32 sample bytes (4 bytes per sample) by
  default; `decode` takes a `Uint8Array`/`Int8Array` view of float32 sample
  bytes. Passing a `Float32Array` throws; passing a string corrupts the data.
- ggwave only consumes whole blocks of `SOUND_SAMPLES_PER_BLOCK` (1024) samples
  and silently drops shorter pushes; `SoundDecoder` buffers for you.
- In fixed-length mode ggwave reports a completed frame again for the next two
  or three blocks; `SoundDecoder` suppresses those echoes.
- `rxToggleProtocol` is global to the module, not per instance.
- A 16-byte frame is 0.51 s on AUDIBLE_FASTEST, 1.02 s on FAST, 1.54 s on NORMAL
  at 48 kHz. Variable-length mode would add ~0.75 s of markers.
- iOS Safari needs a user gesture to start an `AudioContext`; a camera grant
  does not count. Installed home-screen apps re-prompt for camera access on
  every launch.

## Code Conventions

- TypeScript throughout; no `any` unless unavoidable
- Keep `src/lib/` free of DOM access so it stays testable under `deno test`;
  device adapters are the only place that touches `navigator`, `AudioContext`,
  or the camera
- Every URL, `fetch`, and asset path is relative (`./x`), never root-absolute,
  because the site lives under a GitHub Pages project path
- `@/` is the path alias for `src/`
- No comments unless the WHY is non-obvious — name things well instead
- Don't reference current tasks/PRs/issues in comments
- Colocate tests as `*.test.ts` next to the source
