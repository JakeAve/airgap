// The spaceships page: one message per turn carries the answer to their last
// shot and my next one, so the opponent's shot is the only confirmation and
// there is no handshake. The loser's reveal ends the game; the winner's answers it.
import { buildFrames, type Message } from "@/lib/frames/frames.ts";
import type { TransportId } from "@/lib/transport.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { QR_COLORS, QR_GUEST_COLORS } from "@/lib/transports/qr/rasterize.ts";
import { drawQr } from "@/adapters/screen.ts";
import { startApp } from "@/adapters/app.ts";
import { newSessionId, openLink, type PageLink } from "@/adapters/pageLink.ts";
import { deleteSave, getSave, newSaveId, putSave } from "@/games/saves.ts";
import {
  accepts,
  awaitedCounts,
  canPlace,
  cells,
  clampPlacement,
  firstFit,
  type Fleet,
  type Game,
  GRID,
  isLegalShot,
  lastResult,
  myTurn,
  newGame,
  outcome,
  type Placement,
  randomFleet,
  receiveReveal,
  receiveShot,
  type Result,
  REVEAL,
  reveal,
  shipAt,
  SHIPS,
  shipsLeft,
  shoot,
  SHOT,
  sunkRun,
} from "./logic.ts";
import { decodeReveal, decodeShot, encodeReveal, encodeShot } from "./codec.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

const params = new URLSearchParams(location.search);
let role: "host" | "guest" = params.get("role") === "guest" ? "guest" : "host";
let qrColors = QR_COLORS;

const chirp = $<HTMLInputElement>("chirp");
const qrcode = $<HTMLInputElement>("qrcode");
const protocol = $<HTMLSelectElement>("protocol");
const passesInput = $<HTMLInputElement>("passes");
const passes = () => Math.max(1, Math.floor(passesInput.valueAsNumber) || 1);
const code = $<HTMLCanvasElement>("code");
const camera = $<HTMLVideoElement>("camera");
const ping = $<HTMLButtonElement>("ping");
const fireButton = $<HTMLButtonElement>("fire");
const start = $<HTMLButtonElement>("start");
const big = $("big");
const small = $<HTMLButtonElement>("small");
const smallSector = small.querySelector(".sector") as HTMLElement;
const qrEncoder = new QrEncoder();

let page: PageLink | undefined;
const LAST_SHIP = SHIPS.length - 1;
let myFleet: (Placement | null)[] = new Array(SHIPS.length).fill(null);
let current = 0;
myFleet[current] = firstFit(myFleet, current);
let game: Game | undefined;
let theirFleet: Fleet | undefined;
let selected: number | null = null;
let bigEnemy = false;
let note: string | undefined;
let session: number | undefined;
let previousSession: number | undefined;
let lastSent: Message | undefined;
let showing: Message | undefined;
let codeDismissed = false;
let sounding: AbortController | undefined;
let receiving: AbortController | undefined;
let saveId: string | undefined;

function setRole(next: "host" | "guest") {
  role = next;
  qrColors = role === "guest" ? QR_GUEST_COLORS : QR_COLORS;
  document.body.classList.remove("host", "guest");
  document.body.classList.add(role);
  params.set("role", role);
  history.replaceState(null, "", `?${params}`);
  if (role === "guest") {
    session = undefined;
    return;
  }
  do session = newSessionId(); while (session === previousSession);
}

setRole(role);

const CELLS = GRID * GRID;

function hullElement(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "hull");
  svg.setAttribute("viewBox", `0 0 ${GRID} ${GRID}`);
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "0.06");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.style.fill = "var(--bg)";
  return svg;
}

const bigCells = Array.from({ length: CELLS }, (_, cell) => {
  const el = document.createElement("button");
  el.onclick = () => tap(cell);
  return el;
});
const bigHull = hullElement();
const fx = hullElement();
fx.classList.add("fx");
code.before(...bigCells, bigHull, fx);

const smallCells = Array.from(
  { length: CELLS },
  () => document.createElement("span"),
);
const smallHull = hullElement();
smallSector.append(...smallCells, smallHull);

const bigLabel = big.querySelector(".sector-label") as HTMLElement;
const bigCount = bigLabel.querySelector(".mono") as HTMLElement;
const smallLabel = smallSector.querySelector(".sector-label") as HTMLElement;

const pips = SHIPS.map(() => document.createElement("span"));
$("pips").append(...pips);

const hullMarkup = new Map<Element, string>();

function fleetSvg(
  fleet: (Placement | null)[],
  damage: number[],
  pending = -1,
): string {
  return fleet.map((p, ship) => {
    if (!p) return "";
    const L = SHIPS[ship].length;
    const col = p.bow % GRID;
    const row = Math.floor(p.bow / GRID);
    const frame = p.vertical
      ? `translate(${col + 1} ${row}) rotate(90)`
      : `translate(${col} ${row})`;
    const segments = Array.from(
      { length: L - 1 },
      (_, i) => `<line x1="${i + 1}" y1="0.22" x2="${i + 1}" y2="0.78"/>`,
    );
    const hits = cells(ship, p).flatMap((cell, i) =>
      damage.includes(cell)
        ? [
          `<rect class="hit" x="${i + 0.2}" y="0.2" width="0.6" height="0.6"/>`,
        ]
        : []
    );
    return `<g transform="${frame}"${
      ship === pending ? ` class="pending"` : ""
    }>` +
      `<path d="M0.08,0.5 L0.5,0.14 H${L - 0.22} Q${L - 0.08},0.14 ${
        L - 0.08
      },0.28 V0.72 Q${L - 0.08},0.86 ${L - 0.22},0.86 H0.5 Z"/>` +
      `<circle cx="0.72" cy="0.5" r="0.11"/>` +
      segments.join("") +
      `<rect x="${L - 0.06}" y="0.3" width="0.1" height="0.12"/>` +
      `<rect x="${L - 0.06}" y="0.58" width="0.1" height="0.12"/>` +
      hits.join("") +
      `</g>`;
  }).join("");
}

/** Replacing the markup replays the damage animation, so only do it on change. */
function setHull(svg: SVGSVGElement, markup: string) {
  if (hullMarkup.get(svg) === markup) return;
  hullMarkup.set(svg, markup);
  svg.innerHTML = markup;
}

const stillMotion = matchMedia("(prefers-reduced-motion: reduce)");
const pause = (ms: number) =>
  new Promise((done) => setTimeout(done, stillMotion.matches ? 0 : ms));

function fxShape(parent: Element, tag: string, attrs: Record<string, string>) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
}

function centre(cell: number): [number, number] {
  return [cell % GRID + 0.5, Math.floor(cell / GRID) + 0.5];
}

/** A missile streaks onto a big-sector cell: up from below when I fire, down from above when they do. */
async function launch(cell: number, fromAbove: boolean) {
  if (stillMotion.matches) return;
  const [x, y] = centre(cell);
  const x0 = x + (x < GRID / 2 ? 3 : -3);
  const y0 = fromAbove ? -2 : GRID + 2;
  const angle = Math.atan2(y - y0, x - x0) * 180 / Math.PI;
  const missile = fxShape(fx, "g", { class: "missile" });
  fxShape(missile, "polygon", {
    points: "-2.2,0 0,-0.09 0,0.09",
    class: "trail",
  });
  fxShape(missile, "circle", { r: "0.14", class: "core" });
  const at = (px: number, py: number) =>
    `translate(${px}px, ${py}px) rotate(${angle}deg)`;
  await missile.animate(
    [
      { transform: at(x0, y0), opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: at(x, y), opacity: 1 },
    ],
    { duration: 520, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
  ).finished;
  missile.remove();
}

/** The burst where a missile lands: sparks for a hit, a bigger one for a sunk ship, a grey ripple for a miss, a lock-on ring while the result is unknown. */
async function impact(cell: number, result: Result | null) {
  if (stillMotion.matches) return;
  const [x, y] = centre(cell);
  const burst = fxShape(fx, "g", {
    transform: `translate(${x} ${y})`,
    class: result ? result.outcome : "lock",
  });
  const ring = (delay: number, to: number, duration = 600) =>
    fxShape(burst, "circle", { r: "0.5", class: "ring" }).animate(
      [{ transform: "scale(0.3)", opacity: 1 }, {
        transform: `scale(${to})`,
        opacity: 0,
      }],
      { duration, delay, easing: "ease-out", fill: "both" },
    ).finished;
  const done: Promise<unknown>[] = [];
  if (!result) {
    done.push(
      fxShape(burst, "circle", { r: "0.5", class: "ring" }).animate(
        [
          { transform: "scale(1.6)", opacity: 0 },
          { transform: "scale(0.9)", opacity: 1 },
        ],
        { duration: 300, easing: "ease-out" },
      ).finished,
    );
  } else if (result.outcome === "miss") {
    done.push(ring(0, 1.4), ring(180, 2));
  } else {
    const big = result.outcome === "sunk" ? 1.6 : 1;
    done.push(
      fxShape(burst, "circle", { r: "0.45", class: "flash" }).animate(
        [{ transform: "scale(0.2)", opacity: 1 }, {
          transform: `scale(${1.6 * big})`,
          opacity: 0,
        }],
        { duration: 380, easing: "ease-out" },
      ).finished,
      ring(0, 2.2 * big),
    );
    if (big > 1) done.push(ring(160, 4, 800));
    const sparks = fxShape(burst, "g", { class: "sparks" });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      fxShape(sparks, "line", {
        x1: `${Math.cos(a) * 0.25}`,
        y1: `${Math.sin(a) * 0.25}`,
        x2: `${Math.cos(a) * 0.55}`,
        y2: `${Math.sin(a) * 0.55}`,
      });
    }
    done.push(
      sparks.animate(
        [{ transform: "scale(0.6)", opacity: 1 }, {
          transform: `scale(${2.4 * big})`,
          opacity: 0,
        }],
        { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
      ).finished,
    );
  }
  await Promise.all(done);
  burst.remove();
}

function showBig(enemy: boolean) {
  bigEnemy = enemy;
  render();
}

/** Every cell of a ship a sinking shot named, inferred from my own hits. */
function sunkCells(mine: Game["mine"]): Set<number> {
  const cells = new Set<number>();
  for (const shot of mine) {
    if (shot.result?.outcome === "sunk") {
      const length = SHIPS[shot.result.ship ?? 0].length;
      for (const c of sunkRun(mine, shot.cell, length)) cells.add(c);
    }
  }
  return cells;
}

function paintSector(
  els: HTMLElement[],
  svg: SVGSVGElement,
  enemy: boolean,
) {
  const sunk = game && enemy ? sunkCells(game.mine) : undefined;
  els.forEach((el, cell) => {
    let cls = "";
    if (game && enemy) {
      const shot = game.mine.find((s) => s.cell === cell);
      cls = shot
        ? shot.result === null
          ? "sel"
          : shot.result.outcome === "miss"
          ? "miss"
          : sunk!.has(cell)
          ? "sunk"
          : "hit"
        : selected === cell
        ? "sel"
        : "";
    } else if (game) {
      const shot = game.theirs.find((s) => s.cell === cell);
      cls = shot?.result.outcome === "miss" ? "miss" : "";
    }
    el.className = cls;
  });
  setHull(
    svg,
    enemy
      ? theirFleet && game
        ? fleetSvg(theirFleet, game.mine.map((s) => s.cell))
        : ""
      : game
      ? fleetSvg(game.fleet, game.theirs.map((s) => s.cell))
      : fleetSvg(myFleet, [], current),
  );
}

function render() {
  const placing = !game;
  const over = game ? outcome(game) : null;
  paintSector(bigCells, bigHull, bigEnemy);
  paintSector(smallCells, smallHull, !bigEnemy);
  big.classList.toggle("enemy", bigEnemy);
  smallSector.classList.toggle("enemy", !bigEnemy);
  bigLabel.firstChild!.textContent = bigEnemy ? "Enemy sector " : "Your fleet ";
  smallLabel.firstChild!.textContent = bigEnemy ? "Yours " : "Enemy ";
  bigCount.textContent = bigEnemy && game ? `${shipsLeft(game)} ships` : "";
  bigCells.forEach((el, cell) => {
    el.setAttribute(
      "aria-label",
      `row ${Math.floor(cell / GRID) + 1} column ${(cell % GRID) + 1}${
        el.className ? `, ${el.className}` : ""
      }`,
    );
  });
  $("placing").hidden = !placing;
  $("play").hidden = placing;
  $("ship-name").textContent = SHIPS[current].name;
  $("ship-length").textContent = `${SHIPS[current].length} long`;
  $("ship-count").textContent = `${current + 1}/${SHIPS.length}`;
  pips.forEach((pip, ship) => {
    pip.className = ship < current ? "done" : ship === current ? "current" : "";
  });
  $<HTMLButtonElement>("back").disabled = current === 0;
  $<HTMLButtonElement>("rotate").disabled = !myFleet[current];
  $("place").hidden = current === LAST_SHIP;
  $<HTMLButtonElement>("place").disabled = !myFleet[current];
  start.disabled = !myFleet.every(Boolean);
  small.hidden = placing;
  fireButton.hidden = placing;
  ping.hidden = placing;
  start.hidden = game ? page !== undefined : current !== LAST_SHIP;
  fireButton.disabled = !page || !game || !bigEnemy || selected === null ||
    session === undefined || !myTurn(game, role) || over !== null;
  $("again").hidden = !over || (over === "lost" && !theirFleet);
}

function channels(): TransportId[] {
  return [
    ...(chirp.checked ? ["sound" as const] : []),
    ...(qrcode.checked ? ["qr" as const] : []),
  ];
}

function status() {
  const result = game ? outcome(game) : null;
  const [text, tone] = !game
    ? [note ?? "place your fleet", ""]
    : result
    ? [result === "won" ? "you win" : "you lose", ""]
    : channels().length === 0
    ? ["check chirp or qrcode", ""]
    : !page
    ? ["press start to resume", ""]
    : sounding
    ? ["sending", "tx"]
    : myTurn(game, role)
    ? [note ?? "your shot", "tx"]
    : !page?.sound.listening && !page?.qr.watching
    ? ["no mic or camera — check the log", ""]
    : ["waiting for their shot", "rx"];
  $("status").textContent = text;
  $("status").className = tone ? `mono ${tone}-text` : "mono";
  $("dot").className = tone ? `dot ${tone}` : "dot";
}

function drawCode() {
  if (showing && qrcode.checked && !codeDismissed) {
    drawQr(qrEncoder.encode(buildFrames(showing)), code, qrColors);
    code.hidden = false;
  } else {
    code.hidden = true;
  }
}

function describeResult(r: Result | null): string {
  return r === null
    ? "none"
    : r.outcome === "sunk"
    ? `sunk ${SHIPS[r.ship ?? 0].name}`
    : r.outcome;
}

function describe(m: Message): string {
  const shot = m.type === SHOT ? decodeShot(m.payload) : null;
  const what = shot
    ? `shot ${shot.cell} after ${describeResult(shot.result)}`
    : m.type === REVEAL
    ? "reveal"
    : "unknown";
  return `${what} seq ${m.seq} session ${m.session}`;
}

function transmit(m: Message) {
  sounding?.abort();
  sounding = undefined;
  showing = m;
  codeDismissed = false;
  drawCode();
  log(`sent ${describe(m)} over ${channels().join(" + ") || "nothing"}`);
  if (page && chirp.checked) {
    const ctl = new AbortController();
    sounding = ctl;
    page.sound.protocol = protocol.value as SoundProtocol;
    page.sound.maxPasses = passes();
    page.link.send(m, "sound", ctl.signal)
      .catch((err) => log(`chirp failed: ${err}`))
      .finally(() => {
        if (sounding === ctl) sounding = undefined;
        status();
      });
  }
  status();
}

function shipName(fleet: Fleet, cell: number): string {
  return SHIPS[shipAt(fleet, cell)]?.name ?? "fleet";
}

function describeTurn(
  mine: Result | null,
  theirs: Result,
  cell: number,
  fleet: Fleet,
): string {
  const parts: string[] = [];
  if (mine) {
    parts.push(
      mine.outcome === "sunk"
        ? `sunk their ${SHIPS[mine.ship ?? 0].name}`
        : mine.outcome,
    );
  }
  parts.push(
    theirs.outcome === "miss"
      ? "they missed"
      : theirs.outcome === "sunk"
      ? `they sank your ${shipName(fleet, cell)}`
      : `hit on your ${shipName(fleet, cell)}`,
  );
  return parts.join(" · ");
}

/**
 * Once the game is over, a repeat of the peer's last message is its Ping
 * asking for our reply again: the loser's reveal to the winner, the fatal
 * shot to the loser still waiting on the winner's reveal.
 */
async function awaitMove() {
  receiving?.abort();
  receiving = undefined;
  if (!page || !game) return;
  const result = outcome(game);
  if (
    result === "lost"
      ? theirFleet !== undefined
      : result === null && myTurn(game, role)
  ) {
    return;
  }
  const counts = awaitedCounts(game);
  const via: TransportId[] = [];
  if (page.sound.listening) via.push("sound");
  if (page.qr.watching) via.push("qr");
  if (via.length === 0) return;
  const ctl = new AbortController();
  receiving = ctl;
  while (!ctl.signal.aborted) {
    let m: Message;
    try {
      m = await page.link.receive(via, ctl.signal, {
        accept: (leg) => accepts(counts, session, leg, previousSession),
      });
    } catch (err) {
      if (!ctl.signal.aborted) log(`receive failed: ${err}`);
      return;
    }
    if (result === "won" ? m.type === REVEAL : result && m.type === SHOT) {
      log(`received ${describe(m)} again`);
      if (lastSent) transmit(lastSent);
      continue;
    }
    const shot = m.type === SHOT ? decodeShot(m.payload) : null;
    const revealedFleet = m.type === REVEAL ? decodeReveal(m.payload) : null;
    const legal = shot
      ? result === null && !game.theirs.some((s) => s.cell === shot.cell)
      : revealedFleet !== null &&
        (result === "lost" ||
          outcome(receiveReveal(game, revealedFleet)) === "won");
    if (!legal) {
      log(`dropped illegal ${describe(m)}`);
      continue;
    }
    ctl.abort();
    receiving = undefined;
    sounding?.abort();
    sounding = undefined;
    showing = undefined;
    session ??= m.session;
    log(`received ${describe(m)}`);
    const myShot = game.mine.at(-1);
    if (shot) {
      const next = receiveShot(game, shot.result, shot.cell);
      const theirs = next.theirs.at(-1)!.result;
      note = describeTurn(shot.result, theirs, shot.cell, game.fleet);
      if (outcome(next) === "lost") {
        game = next;
        sendReveal();
      } else {
        moved(next);
      }
      const played: Game | undefined = game;
      // Show the answer to my own shot first — it's what I've been waiting on —
      // then their new shot landing on my board.
      if (myShot && shot.result) {
        showBig(true);
        await impact(myShot.cell, shot.result);
        if (game !== played) return;
      }
      showBig(false);
      await launch(shot.cell, true);
      if (game !== played) return;
      await impact(shot.cell, theirs);
      if (game !== played) return;
      showBig(outcome(game) !== null || myTurn(game, role));
    } else if (revealedFleet) {
      theirFleet = revealedFleet;
      game = receiveReveal(game, revealedFleet);
      if (outcome(game) === "lost") moved(game);
      else sendReveal();
      const landed = game.mine.at(-1);
      if (myShot?.result === null && landed?.result) {
        await impact(landed.cell, landed.result);
      }
    }
  }
}

function dropSave() {
  saveId = undefined;
  params.delete("save");
  history.replaceState(null, "", `?${params}`);
}

function persist() {
  if (!game || session === undefined || game.count === 0) return;
  if (outcome(game)) {
    if (saveId) deleteSave(localStorage, saveId);
    dropSave();
    return;
  }
  saveId ??= newSaveId();
  putSave(localStorage, {
    id: saveId,
    game: "spaceships",
    role,
    session,
    count: game.count,
    playedAt: Date.now(),
    moves: [],
    data: game,
  });
  params.set("save", saveId);
  history.replaceState(null, "", `?${params}`);
}

function moved(next: Game) {
  game = next;
  persist();
  bigEnemy = outcome(game) !== null || myTurn(game, role);
  selected = null;
  render();
  drawCode();
  if (outcome(game)) log(`game over: ${outcome(game)}`);
  awaitMove();
  status();
}

function sendReveal() {
  if (!game || session === undefined) return;
  lastSent = {
    type: REVEAL,
    seq: game.count % 4,
    session,
    payload: encodeReveal(game.fleet),
  };
  ping.disabled = false;
  moved(reveal(game));
  transmit(lastSent);
}

function tap(cell: number) {
  if (!game) {
    placeAt(cell);
    return;
  }
  if (!bigEnemy || !myTurn(game, role) || !isLegalShot(game, cell)) return;
  selected = selected === cell ? null : cell;
  render();
}

function placeAt(cell: number) {
  movePending({ bow: cell, vertical: myFleet[current]?.vertical ?? false });
}

function movePending(p: Placement) {
  const fitted = clampPlacement(current, p);
  if (canPlace(myFleet, current, fitted)) {
    myFleet[current] = fitted;
    note = undefined;
  } else {
    note = "doesn't fit";
  }
  render();
  status();
}

$("rotate").onclick = () => {
  const p = myFleet[current];
  if (p) movePending({ bow: p.bow, vertical: !p.vertical });
};

$("place").onclick = () => {
  if (!myFleet[current] || current === LAST_SHIP) return;
  current++;
  myFleet[current] = firstFit(myFleet, current);
  note = undefined;
  render();
  status();
};

$("back").onclick = () => {
  if (current === 0) return;
  myFleet[current] = null;
  current--;
  note = undefined;
  render();
  status();
};

fireButton.onclick = async () => {
  if (!game || session === undefined || selected === null) return;
  const cell = selected;
  lastSent = {
    type: SHOT,
    seq: game.count % 4,
    session,
    payload: encodeShot(lastResult(game), cell),
  };
  ping.disabled = false;
  note = undefined;
  moved(shoot(game, cell));
  transmit(lastSent);
  const fired = game;
  showBig(true);
  await launch(cell, false);
  await impact(cell, null);
  await pause(250);
  if (game === fired) showBig(outcome(game) !== null || myTurn(game, role));
};

small.onclick = () => {
  bigEnemy = !bigEnemy;
  render();
};

$("randomize").onclick = () => {
  myFleet = randomFleet();
  current = LAST_SHIP;
  note = undefined;
  render();
  status();
};

async function syncChannels() {
  receiving?.abort();
  if (!page) return;
  try {
    if (chirp.checked) await page.sound.listen();
    else page.sound.stopListening();
  } catch (err) {
    log(`microphone failed: ${err}`);
  }
  if (!chirp.checked) {
    sounding?.abort();
    sounding = undefined;
  }
  try {
    if (qrcode.checked) await page.qr.watch();
    else page.qr.stopWatching();
  } catch (err) {
    log(`camera failed: ${err}`);
  }
  camera.hidden = !page.qr.watching;
  drawCode();
  awaitMove();
  status();
}

start.onclick = async () => {
  start.disabled = true;
  $("status").textContent = "opening devices";
  if (!page) {
    try {
      page = await openLink(code, camera);
      page.sound.log = log;
      // The two phones face each other screen to screen.
      page.qr.facing = "user";
    } catch (err) {
      log(`could not start: ${err}`);
      start.disabled = false;
      status();
      return;
    }
    log(
      `${role} at ${page.sampleRate} Hz, ${protocol.value}, ${passes()} passes, session ${
        session ?? "from the first shot"
      }`,
    );
  }
  note = undefined;
  if (game) render();
  else moved(newGame(myFleet as Fleet));
  await syncChannels();
};

const SETTINGS_KEY = "airgap.settings";
const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
chirp.checked = saved.chirp ?? true;
qrcode.checked = saved.qrcode ?? false;
protocol.value = saved.protocol ?? protocol.value;
if (!protocol.value) protocol.selectedIndex = 0;
passesInput.value = saved.passes ?? passesInput.value;

$("settings").onchange = (event) => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      chirp: chirp.checked,
      qrcode: qrcode.checked,
      protocol: protocol.value,
      passes: passes(),
    }),
  );
  if (event.target === chirp || event.target === qrcode) syncChannels();
};
const menu = $<HTMLDetailsElement>("menu");
document.addEventListener("click", (event) => {
  if (!menu.contains(event.target as Node)) menu.open = false;
});

code.onclick = () => {
  codeDismissed = true;
  drawCode();
};

ping.onclick = () => {
  if (lastSent) transmit(lastSent);
};

function reset(nextRole: "host" | "guest") {
  receiving?.abort();
  sounding?.abort();
  sounding = undefined;
  previousSession = session;
  dropSave();
  $("place").after(start);
  setRole(nextRole);
  game = undefined;
  theirFleet = undefined;
  selected = null;
  note = undefined;
  lastSent = undefined;
  showing = undefined;
  bigEnemy = false;
  ping.disabled = true;
  log(`new game: ${role}, session ${session ?? "from the first shot"}`);
  render();
  drawCode();
  status();
}

$("replay").onclick = () => reset(role);
$("switch").onclick = () => reset(role === "host" ? "guest" : "host");

const isInt = (x: unknown, below = Infinity): x is number =>
  Number.isInteger(x) && (x as number) >= 0 && (x as number) < below;

function isResult(x: unknown): x is Result {
  const r = x as Partial<Result> | null;
  return typeof r === "object" && r !== null &&
    ["miss", "hit", "sunk"].includes(r.outcome as string) &&
    (r.ship === null || isInt(r.ship, SHIPS.length));
}

function isGame(x: unknown): x is Game {
  const g = x as Partial<Game> | null;
  if (typeof g !== "object" || g === null || !isInt(g.count)) return false;
  const { fleet, mine, theirs } = g;
  return Array.isArray(fleet) && fleet.length === SHIPS.length &&
    fleet.every((p, ship) =>
      typeof p === "object" && p !== null && typeof p.vertical === "boolean" &&
      canPlace(fleet, ship, p)
    ) &&
    Array.isArray(mine) &&
    mine.every((s) =>
      isInt(s?.cell, CELLS) && (s.result === null || isResult(s.result))
    ) &&
    Array.isArray(theirs) &&
    theirs.every((s) => isInt(s?.cell, CELLS) && isResult(s.result));
}

function restore(id: string): boolean {
  const save = getSave(localStorage, id);
  if (
    save?.game !== "spaceships" ||
    (save.role !== "host" && save.role !== "guest") ||
    !isInt(save.session, 256) || !isGame(save.data) ||
    outcome(save.data) !== null
  ) {
    return false;
  }
  setRole(save.role);
  session = save.session;
  saveId = id;
  game = save.data;
  myFleet = game.fleet;
  current = LAST_SHIP;
  bigEnemy = myTurn(game, role);
  const pending = game.mine.at(-1);
  if (!bigEnemy && pending?.result === null) {
    lastSent = {
      type: SHOT,
      seq: (game.count - 1) % 4,
      session,
      payload: encodeShot(lastResult(game), pending.cell),
    };
    ping.disabled = false;
  }
  fireButton.before(start);
  log(`resumed ${role}, session ${session}, count ${game.count}`);
  return true;
}

const saveParam = params.get("save");
if (saveParam !== null && !restore(saveParam)) {
  deleteSave(localStorage, saveParam);
  dropSave();
  log(`could not restore save ${saveParam}; starting fresh`);
}

render();
status();
startApp({ home: false });
