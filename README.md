# Airgap

A library of simple two-player arcade games that run entirely in the browser
with no server. Two phones exchange moves ("orders") directly, by sound
([ggwave](https://github.com/ggerganov/ggwave)) or by QR code. The two channels
are interchangeable, so a noisy room or a broken camera never blocks a game.

Hosted on GitHub Pages as a PWA: install it to the home screen and every page,
including the games, keeps working with no network at all.

Every game saves after each move and offers the other player's side as a QR
code, so the second phone can pick a match up mid-game by scanning it on the
Resume screen instead of starting over.

## Setup

Requires [Deno](https://deno.com) 2.x.

```bash
deno task setup   # installs the git hooks (run once after cloning)
deno task dev     # builds to dist/ and serves it at http://localhost:8443, rebuilding on change
```

## Commands

```bash
deno task check   # fmt check + lint + type check
deno task test    # unit tests
deno task build   # production build to dist/
deno task e2e     # build, then drive the pages in headless Chromium with fake
                  # devices, and confirm every page still loads offline
deno task determinism  # replay a game's golden checksum in Chromium, Firefox,
                       # and WebKit
```

`e2e` needs a Chromium (`deno run -A npm:playwright install chromium`);
`determinism` needs all three engines
(`deno run -A npm:playwright install chromium firefox webkit`).

The pre-commit and pre-push hooks run `check` and `test`.

## Testing on phones

Open `/diag.html` on two devices to send a message between them by sound or QR,
or `/handshake.html?role=host` on one and `/handshake.html?role=guest` on the
other for a full call, reply and ack round. Browsers only allow the microphone
and camera on secure origins, so for local testing over Wi-Fi the dev server
needs a certificate. With [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkdir -p .certs
mkcert -cert-file .certs/cert.pem -key-file .certs/key.pem localhost 192.168.1.10
deno task dev   # now serves https on port 8443
```

Replace the IP with your machine's LAN address and install mkcert's root CA on
each phone. The deployed GitHub Pages site is already HTTPS.

## Deploy

Pushes to `main` build and deploy to GitHub Pages via
`.github/workflows/pages.yml`.
