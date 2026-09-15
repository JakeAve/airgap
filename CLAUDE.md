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
deno task dev          # build + serve dist/ on :8443, rebuild on change
deno task build        # production build → dist/
deno task check        # fmt check + lint + type check
deno task test         # unit tests
deno task pre-commit   # check + test (also run by .githooks/pre-commit)
deno task pre-push     # check + test (also run by .githooks/pre-push)
deno task e2e          # build, then drive diag.html and handshake.html in headless Chromium with fake devices, then confirm every page loads offline from the service worker
deno task determinism  # bundle a game's logic and run its golden checksum in Chromium, Firefox, and WebKit
```

`deno task e2e` needs a Chromium: `deno run -A npm:playwright install chromium`
once, or set `CHROMIUM_PATH` (the web sandbox's session hook does this).

`deno task determinism` needs all three engines once:
`deno run -A npm:playwright install chromium firefox webkit`.

Always run `deno task pre-commit` (or let the git hook run it) before
committing.

## Workflow

Default: work in a git worktree branched from `origin/main`, not the current
checkout. `git fetch origin main` first; if local `main` is stale, `git pull`
it. Open a PR when the task is done — don't commit straight to the branch you
started in. Once the PR merges, remove the worktree (`git worktree remove`) and
delete the branch.

## Directory Map

- `static/` — copied verbatim into `dist/`: `index.html`, `styles.css`,
  `manifest.webmanifest`, `icons/`, `screenshots/` (manifest screenshots),
  `fonts/` (self-hosted Silkscreen, Space Grotesk, and JetBrains Mono woff2s
  plus each family's `OFL-*.txt` license)
- `src/main.ts` — app entry; bundled to `dist/main.js`
- `src/sw.ts` — service worker; bundled to `dist/sw.js`. `__BUILD_ID__` is
  replaced at build time so each build gets its own cache, and `__APP_SHELL__`
  with every built file (minus sourcemaps and dotfiles); it serves cache-first
  and only skips waiting when asked from the home page with at most one Airgap
  window open.
- `src/diag.ts` + `static/diag.html` — diagnostics page: send and receive a test
  message over either transport, with timing log; its handshake form is a GET to
  the exchange screen
- `src/handshake.ts` + `static/handshake.html` — the exchange screen: one
  call/reply/ack round over sound, QR, or both, every setting a URL parameter
  (`role`, `via`, `text`, `protocol`, `turnaround`, `guard`, `retries`, `next`)
- `src/games/saves.ts` — the saves store in `localStorage`: list/get/put/delete,
  eviction past `MAX_SAVES_PER_GAME`, the share-hash codec (`encodeShare` /
  `decodeShare`), and `gameLink`, which accepts a scanned URL naming a known
  game page with a decodable `#r=` hash and rebuilds it on the scanning page's
  own origin, so phones on different addresses can share and nothing scanned
  navigates off-site
- `src/restore.ts` + `static/restore.html` — the resume-with-QR page: opens the
  rear camera on a tap and decodes on the main thread (no codec worker, since it
  reads a plain link, not a wire-protocol frame), navigating on the first
  `gameLink`-accepted code and otherwise showing "not an Airgap game" while
  scanning continues
- `src/codecWorker.ts` — Web Worker hosting ggwave (sound encode + decode) and
  the QR decoder; bundled to `dist/codec-worker.js`
- `src/captureWorklet.ts` — AudioWorklet that forwards microphone samples in
  1024-sample blocks; bundled to `dist/capture-worklet.js`
- `src/adapters/` — the only browser-API code: `codecWorker.ts` (page-side
  handle), `speaker.ts`, `microphone.ts`, `screen.ts`, `camera.ts`,
  `soundTransport.ts` / `qrTransport.ts` implementing `Transport`, and
  `pageLink.ts` building the worker and both transports for a page, and `app.ts`
  whose `startApp` every page calls: registers the service worker, shows the
  one-time offline toast, applies waiting updates from the home page only,
  requests persistent storage when installed, and holds a screen wake lock on
  every other page
- `src/lib/` — pure, tested modules shared by every game
  - `protocol.ts` — wire protocol constants (frame layout, limits)
  - `bits/` — `BitWriter`, `BitReader`, `crc8`
  - `frames/` — `Leg`, `Message`, `buildFrames`, `parseFrame`, `Reassembler`
  - `transports/sound/` — `SoundEncoder` (frame → float32 samples),
    `SoundDecoder` (samples → frames), `ggwave.ts` (module loader, shared
    parameters)
  - `transports/qr/` — `QrEncoder` (frames → module matrix), `QrDecoder` (RGBA
    image → frames), `rasterize.ts` (matrix → RGBA, used by tests and the screen
    adapter), `bytesAsText.ts`
  - `transport.ts` — `Transport` interface and abort helpers
  - `link.ts` — `Link`: message in, frames out over one transport; frames in
    over any transports, one message out
  - `transports/codecWorkerProtocol.ts` — message types for the worker
- `src/games/<game>/` — `codec.ts`, `logic.ts`, `ui.ts` per game. `diag/` is the
  diagnostics page's game: free text at five bits a character; `ticTacToe/` is
  the board, turn order, and the win/draw check; `checkers/` is the board,
  captures, kinging, and forced-jump rules; `spaceships/` is battleship: fleet
  placement, two 10×10 sectors, and the end-of-game reveal; `chess/` is the
  board, full FIDE movement, check, and every draw; `hive/` is Swarm, a Hive
  game on a hex grid: stacks, per-piece moves, Crane throws, and the
  surrounded-Motherboard win; `packetStorm/` is artillery on a destructible
  ridge: integer-only flight, craters, wind, and a per-move checksum
- `src/games/turn.ts` + `src/games/turnPage.ts` — the shared turn-game page:
  `turn.ts` has the `Role` type and the no-handshake accept rule, `turnPage.ts`
  has the DOM plumbing (settings menu, log, QR/sound transmit, receive loop)
  tic-tac-toe, checkers, chess, Swarm, and Packet Storm mount
- `src/games/ticTacToe/ui.ts` + `static/tictactoe.html`,
  `src/games/checkers/ui.ts` + `static/checkers.html`, `src/games/chess/ui.ts` +
  `static/chess.html`, `src/games/hive/ui.ts` + `static/swarm.html`, and
  `src/games/packetStorm/ui.ts` + `static/packetstorm.html` — each game's board
  and screen, all mounting the shared page from `turnPage.ts`
- `src/games/spaceships/ui.ts` + `static/spaceships.html` — spaceships' screen
  on the same viewfinder layout, with its own page plumbing because it sends a
  second message type (the reveal) and has a placement phase before Start
- `scripts/` — Deno scripts (`build.ts`, `dev.ts` with optional HTTPS from
  `.certs/`, `e2e/` Playwright run against fake devices plus `offline.ts`, which
  serves `dist/` and drives every page in headless Chromium with the network off
  to prove the service worker covers it)
- `types/` — hand-written declarations for untyped npm packages
- `.githooks/` — pre-commit and pre-push; enabled by `deno task setup`
- `.github/workflows/` — `ci.yml` (check, test, build on every push) and
  `pages.yml` (deploy `dist/` on push to `main`)

## Architecture

Games hand a `Message` (a leg plus a payload of up to 8 bytes) to a single
`Link`. The Link splits it into fixed-size frames and hands them to whichever
transport the user picked. Transports only move frames, so a receiver can
collect frames from sound and QR interchangeably and the reassembler does not
care which delivered them.

- **Frame** (`FRAME_BYTES` = 5, 40 bits): type 2 | seq 2 | session 8 | index 2 |
  total-1 2 | payload 16 | crc8. Every frame names its leg, so a receiver
  filters frames before reassembly and retries of one leg add up. Up to 4 frames
  per message, so 8 payload bytes. There is no version or length field: a
  different layout never decodes, and each game's codec knows where its data
  ends (received payloads are zero-padded to whole frames).
- **Why 5 bytes:** ggwave costs one transmit slot per 3 bytes of frame plus
  Reed-Solomon (`max(4, 2*floor(L/5))` bytes), so 5 is the largest frame that
  fits 3 slots. Shrinking bytes inside a slot saves nothing.
- **Sound:** ggwave in fixed-length payload mode, one frame per transmission,
  AUDIBLE_FASTEST by default with FAST as the fallback. Fixed-length mode has no
  start/end markers, so decoding is continuous; the CRC and the leg fields
  reject false positives. Sending will loop the frame sequence until stopped;
  there is no back channel.
- **QR:** a whole message in one code, byte mode with a latin1 text hook so
  bytes are not UTF-8 expanded.
- Decoders and the sound encoder run in the codec worker, so the main bundle
  carries no ggwave. The AudioWorklet forwards sample blocks; the camera loop
  posts downscaled ImageData and waits for each decode before grabbing the next
  frame. Both decoders share a `push(chunk)` interface returning frames.
- Sending loops the frame sequence until its abort signal fires; receiving
  resolves on the first complete message and then stops every transport it
  opened. Both transports can also be left rolling (`listen`/`watch`) so a
  receive between legs never waits on `getUserMedia`.
- The handshake and its hardware lessons live in `.claude/skills/exchange`; read
  it before touching legs, windows, or the exchange screen.
- Turn games skip the handshake: the opponent's next move is the only
  confirmation a turn needs, so a lost move gets a Ping button (send it again)
  instead of the handshake's windows and retries.
- Every turn game saves itself after each move to `localStorage` (`saves.ts`)
  and offers the save's other player role encoded in a QR share hash (`#r=...`),
  so the second device can resume by scanning it on `restore.html` instead of
  replaying the handshake.

## Wire-protocol facts worth remembering

- ggwave's JS `encode` returns float32 sample bytes (4 bytes per sample) by
  default; `decode` takes a `Uint8Array`/`Int8Array` view of float32 sample
  bytes. Passing a `Float32Array` throws; passing a string corrupts the data.
- ggwave only consumes whole blocks of `SOUND_SAMPLES_PER_BLOCK` (1024) samples
  and silently drops shorter pushes; `SoundDecoder` buffers for you.
- In fixed-length mode ggwave reports a completed frame again one transmit slot
  later, up to 9 blocks on NORMAL; `SoundDecoder` suppresses those echoes within
  12 blocks, so identical frames must be sent further apart than that.
- `rxToggleProtocol` is global to the module, not per instance.
- A 5-byte frame is 0.19 s on AUDIBLE_FASTEST, 0.38 s on FAST, 0.58 s on NORMAL
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
