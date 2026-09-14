---
name: style
description: Use when adding or changing anything a player sees in Airgap — a page, a game's screen, a control, a status readout, the QR code, the icons — or when a design choice needs a reason. Carries the Graphite theme (tokens, type, the two-accent rule, where glow is allowed) and the CSS classes that already implement it, so new UI extends the system instead of inventing one.
---

# Airgap style

Modern arcade, restrained: near-black, one amber and one teal, pixel wordmark,
grotesk UI, mono values. Dark only. Everything below is already implemented in
`static/styles.css`; reuse the classes before writing new CSS.

## The one rule that gives the palette meaning

**Amber is anything that transmits. Teal is anything that listens.** Nothing
else glows. A Send button, the QR code, a "sending" status: amber (`tx`). A
Listen button, the camera frame, a "waiting on sound" status: teal (`rx`).
Neutral things (device facts, the log, a game board) stay grey so the glow still
signals something. If a control does both, it is neutral.

## Tokens (`:root` in `static/styles.css`)

| token                        | value                             | use                                                    |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ |
| `--bg`                       | `#0a0a0b`                         | page                                                   |
| `--surface` / `--surface-2`  | `#121214` / `#19191c`             | panels, icon wells                                     |
| `--line` / `--line-strong`   | `#262629` / `#363639`             | borders, rules                                         |
| `--fg` / `--muted` / `--dim` | `#f2f2f0` / `#8b8b90` / `#5c5c62` | text tiers                                             |
| `--tx`, `--tx-rgb`           | `#ff9f00`, `255, 159, 0`          | transmit accent (Jake picked this saturation; keep it) |
| `--tx-core`, `--tx-ink`      | `#ffd28a`, `#1a0d04`              | hot centre of a glow, text on amber                    |
| `--rx`, `--rx-rgb`           | `#34d5c4`, `52, 213, 196`         | receive accent                                         |
| `--rx-core`, `--rx-ink`      | `#a9f2ea`, `#04171a`              | hot centre, text on teal                               |
| `--warn`                     | `#ffb454`                         | rare; errors are prose, not colour                     |

The `-rgb` triplets exist so glows can be `rgba(var(--tx-rgb), 0.35)`. Never
introduce a third accent or a blue; the original draft was blue and was rejected
for looking like every other dark theme.

## Type

- `--font-mark` Silkscreen 700: the wordmark and small uppercase labels only. It
  is a pixel face; never use it for prose or above ~2.5rem.
- `--font-ui` Space Grotesk: everything readable.
- `--font-mono` JetBrains Mono: values, ids, timings, the log, input text.

Loaded from Google Fonts with `display=swap` and real fallbacks, so an offline
install still renders. Do not add a fourth face.

## Classes that exist

- `.card` a panel with corner ticks. `.card.tx` / `.card.rx` light its top edge.
  `.card.dashed` is the empty state. `.card.link-card` is a whole-card link with
  `.icon`, `.text` (`strong` + `small`) and `.chevron`.
- `.card.game` is a home-page game: a `<details name="game">` (so one opens at a
  time) whose `summary` is a link-card row and whose `form` GETs the game page
  with `role=host` (`button.tx`) or `role=guest` (`button.rx`). Its icon draws
  both players, `.x` in `--x` and `.o` in `--o`, flat with no glow.
- `.card-head` a header row; the `h2` inside a card is already a small label.
- `.label`, `.label.tx`, `.label.rx` small pixel labels; `.rule` puts a line
  after one. `.mark` is the pixel face for a short heading.
- `button` alone is the outlined neutral control. `button.tx` / `button.rx` are
  filled and chamfered. `button.ghost-tx` / `button.ghost-rx` are outlined in an
  accent for secondary accent actions. Disabled state is automatic.
- `input`, `select`, `label` are styled bare; wrap a control in a `label` with
  the caption as leading text. Focus glows amber.
- `.readout` a dark well with `.status` (teal mono line) and `.value` (caption +
  `strong`). `.dot`, `.dot.tx`, `.dot.rx` status dots; `rx` pulses.
- `.qr` the code canvas, `.camera` the preview, `.log` the transcript. `.camera`
  is `position: fixed` to the bottom half of the page with the body padded to
  match; `.camera-flip` floats at its corner; `.camera.mirrored` flips a
  front-camera preview. Fixed layers carry explicit z-indexes (camera 10,
  flip 11) because every `.card` is positioned for its corner ticks and would
  otherwise paint over them.
- `.rx-text` / `.tx-text` colour and glow a run of text in an accent.
- `body.viewfinder` is the exchange screen (`handshake.html`): a flex column the
  height of the viewport that never scrolls, with the camera full-bleed behind.
  `.vf-head` (wordmark, Stop), `.vf-code` (the current leg, 220px, centred),
  `.vf-middle` (fills; Start, the outcome, Continue or Retry, and `.vf-flip`
  pinned to its bottom right), `.vf-foot` (`.vf-status` dot + mono status +
  elapsed, then a `<details>` holding `.log`). Only the log scrolls. Swarm is
  the exception: its `.vf-middle` scrolls because the board, two trays, and Ping
  do not fit beside the camera on a phone, and the QR code scrolls itself into
  view when drawn. Add game UI into `.vf-middle`, not around it. The exception
  to the two-accent rule lives here: the page has no role label, and instead
  `body.host` is all amber and `body.guest` is all teal. `.host` points the
  `--rx*` tokens at `--tx*` and `.guest` points `--tx*` at `--rx*`, so every
  class follows. The QR code uses `QR_GUEST_COLORS` for the guest.
- `.stack`, `.row`, `.facts` (`dl` grid), `.mono`, `.muted`.
- `.grid-floor` the perspective floor. Home page only; it is decoration and a
  second one on a busy page reads as noise.

## Glow, and where it is allowed

Glow is layered `box-shadow`/`text-shadow` in the accent's rgb at falling
alphas, with a lighter `-core` colour at the centre. It appears in exactly six
places: the wordmark, accent labels, the top edge of an accent card, accent
buttons, status dots, and the focused input. Adding glow anywhere else needs a
reason as strong as "this is the thing transmitting right now".

Chamfered buttons use `corner-shape: bevel` on an 8px radius. Do not switch to
`clip-path` for the chamfer: it clips the glow, which is exactly the bug the
design pass found. Browsers without `corner-shape` show rounded corners.

## The QR code

Amber modules on the page background, not black on white. `QR_COLORS` in
`src/lib/transports/qr/rasterize.ts` is the single source; the screen adapter,
the unit tests and the e2e camera fixture all draw from it, so a colour change
is proved decodable by `deno task test` and `deno task e2e`. The decoder handles
inverted codes; keep the module colour bright and the background near black or
that stops being true.

## The exchange screen was designed on a canvas

Three directions were drafted and Viewfinder was chosen; the canvas with the
alternates and the pieces sheet is at
https://claude.ai/code/artifact/65b54760-d228-413e-ab75-01c4f44e2d4a. Start
there when changing the exchange screen rather than redrawing from scratch.

## When adding a game screen

Board on a neutral `.card`; the player's own move control in `tx`, the wait for
the opponent in `rx`; timings and ids in `.mono`; the wordmark links home.
Buttons stay 44px tall. Prefer the existing classes over inline styles, and add
to `styles.css` only what more than one screen will use.

Tic-tac-toe marks are the host's and guest's colours on both phones: X amber, O
teal, read from `--x`/`--o`, which are set on `:root` before `body.host` and
`body.guest` fold the accents. A win is the seventh place glow is allowed: the
`.strike` line and the three `.win` cells, in the winner's colour, while the
rest of the board dims. A draw dims the board in a wave. All of it stops under
`prefers-reduced-motion`.

A two-player board reads `--me`/`--them`, not the accents and not `--x`/`--o`
directly: both pairs are derived from `--x`/`--o` on `:root` and swapped under
`body.guest`, so one rule set draws either side's colours on either phone.

Spaceships' sectors are `.sector` CSS grids with the ships drawn as one inline
`.hull` SVG per grid, laid over the cells with a 10×10 viewBox so a ship's
coordinates are cell coordinates and one drawing serves placement, play and the
reveal. Cells are buttons on the big sector and spans on the small one, because
the small card is itself a button. Damage on `.hull .hit` is the eighth place
glow is allowed, a selected cell the ninth, and the ship being placed
(`.hull .pending`, with the placed ones dimmed) the tenth. `.sector` binds
`--owner` and `--shooter` (with `-rgb` and `-core` pairs) to `--me` and
`--them`; the hull, hit and selection rules read only those, and `.sector.enemy`
swaps the binding, so the same markup and rules show a revealed enemy fleet.
Placement is one ship at a time in `SHIPS` order: `.placing` holds the ship's
name and `n/5`, the `.pips` progress, and Back / Rotate / Place (Start on the
last ship) in `.placing-controls`, with Randomize All under them. The pips are
built by the page, so the markup carries an empty `#pips`. The placement canvas
is at https://claude.ai/code/artifact/47de8284-cc69-41ac-b29f-8e7d33850402.

The big sector's cells come out around 34px on a phone, under the 44px rule;
selecting a cell and then pressing Fire is the mitigation, untested on a real
phone.

Chess pieces are one inline SVG sprite of six `<symbol>`s in the page, each
square drawing its piece with a `<use>` filled from `--mark`, white taking `.x`
and black `.o` so the `--me`/`--them` folding applies unchanged. The board's
light and dark squares are `--surface-2` and `--line`. The king in check wears a
`--warn` ring, the only `--warn` in the app, because it is a warning and that is
what the token is for. A selection and the last move stay neutral, like
checkers' `.from` and `.to`.

Swarm's board is one inline SVG inside `.board.hive`: every hex is a
`<g class="hex">` holding a flat-top `<path>` and a `<use>` of the piece's icon
from the `.sprite` of `<symbol id="icon-<kind>">` in `swarm.html`, translated to
its axial position in units of hex radius, and the viewBox is refit on each
render to the hive plus one ring of empty neighbours. `.hex.me` / `.hex.them`
bind `--mark` (and `-rgb`, `-core`, `-ink`) to `--me` / `--them` so the tint and
stroke rules read one token. Kinds differ by tone, never by a third hue: the
`.motherboard` hex is a solid `--mark` tile with an `--mark-ink` icon, `.fpga`,
`.probe` and `.crane` go pale in `--mark-core`, the rest keep the plain tint;
`.from`, `.to` (a `.dot` on an empty hex, a dashed stroke on a climb), `.pick`
(a neighbour a Crane can lift) and `.win` (the surrounded Motherboard, the glow
via `drop-shadow`) are the only states. The trays under the card are plain
outlined buttons in `--me` for your pieces and a mono line of counts for theirs.
Hexes come out well under 44px on a phone once the hive is wide; the mitigation
planned is pan and zoom.
