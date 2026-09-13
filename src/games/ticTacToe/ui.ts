// The tic-tac-toe page: each move goes out once over the checked channels and
// the opponent's next move is the only confirmation, so there is no handshake.
import { buildFrames, type Message } from "@/lib/frames/frames.ts";
import type { TransportId } from "@/lib/transport.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { QR_COLORS, QR_GUEST_COLORS } from "@/lib/transports/qr/rasterize.ts";
import { drawQr } from "@/adapters/screen.ts";
import { newSessionId, openLink, type PageLink } from "@/adapters/pageLink.ts";
import {
  accepts,
  type Board,
  emptyBoard,
  isLegal,
  type Mark,
  MOVE,
  moveCount,
  outcome,
  play,
  turn,
  winningLine,
} from "./logic.ts";
import { decodeMove, encodeMove } from "./codec.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

const params = new URLSearchParams(location.search);
let role: "host" | "guest" = params.get("role") === "guest" ? "guest" : "host";
let me: Mark = "X";
let them: Mark = "O";
let qrColors = QR_COLORS;

const chirp = $<HTMLInputElement>("chirp");
const qrcode = $<HTMLInputElement>("qrcode");
const protocol = $<HTMLSelectElement>("protocol");
const passesInput = $<HTMLInputElement>("passes");
const passes = () => Math.max(1, Math.floor(passesInput.valueAsNumber) || 1);
const code = $<HTMLCanvasElement>("code");
const camera = $<HTMLVideoElement>("camera");
const ping = $<HTMLButtonElement>("ping");
const qrEncoder = new QrEncoder();

let page: PageLink | undefined;
let board: Board = emptyBoard();
let session: number | undefined;
let previousSession: number | undefined;
let lastSent: Message | undefined;
let showing: Message | undefined;
let codeDismissed = false;
let sounding: AbortController | undefined;
let receiving: AbortController | undefined;

function setRole(next: "host" | "guest") {
  role = next;
  me = role === "host" ? "X" : "O";
  them = me === "X" ? "O" : "X";
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

const cells = Array.from({ length: 9 }, (_, cell) => {
  const el = document.createElement("button");
  el.onclick = () => tap(cell);
  $("board").append(el);
  return el;
});

const boardEl = $("board");
const strike = document.createElement("span");
strike.className = "strike";
strike.hidden = true;
boardEl.append(strike);

function render() {
  cells.forEach((el, cell) => {
    const mark = board[cell];
    el.textContent = mark ?? "";
    el.className = mark?.toLowerCase() ?? "";
    el.setAttribute(
      "aria-label",
      `row ${Math.floor(cell / 3) + 1} column ${(cell % 3) + 1}, ${
        mark ?? "empty"
      }`,
    );
  });
  const result = outcome(board);
  const line = winningLine(board);
  boardEl.classList.toggle("over", result !== null);
  boardEl.classList.toggle("draw", result === "draw");
  line?.forEach((cell) => cells[cell].classList.add("win"));
  strike.hidden = !line;
  if (line) drawStrike(line);
}

/** Runs from the centre of the first winning cell to the centre of the last. */
function drawStrike([first, , last]: number[]) {
  const from = cells[first];
  const to = cells[last];
  const origin = boardEl.getBoundingClientRect();
  const centre = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return [r.x + r.width / 2 - origin.x, r.y + r.height / 2 - origin.y];
  };
  const [x1, y1] = centre(from);
  const [x2, y2] = centre(to);
  const pad = from.offsetWidth / 3;
  const length = Math.hypot(x2 - x1, y2 - y1) + 2 * pad;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  strike.className = `strike ${board[first]?.toLowerCase()}`;
  strike.style.width = `${length}px`;
  strike.style.left = `${x1 - Math.cos(angle) * pad}px`;
  strike.style.top = `${y1 - Math.sin(angle) * pad}px`;
  strike.style.rotate = `${angle}rad`;
}

function channels(): TransportId[] {
  return [
    ...(chirp.checked ? ["sound" as const] : []),
    ...(qrcode.checked ? ["qr" as const] : []),
  ];
}

function status() {
  const result = outcome(board);
  const [text, tone] = !page
    ? ["ready", ""]
    : result === "draw"
    ? ["draw", ""]
    : result
    ? [`${result} wins, you ${result === me ? "win" : "lose"}`, ""]
    : channels().length === 0
    ? ["check chirp or qrcode", ""]
    : sounding
    ? ["sending", "tx"]
    : turn(board) === me
    ? ["your move", "tx"]
    : !page.sound.listening && !page.qr.watching
    ? ["no mic or camera — check the log", ""]
    : [`waiting for ${them}`, "rx"];
  $("status").textContent = text;
  $("status").className = tone ? `mono ${tone}-text` : "mono";
  $("dot").className = tone ? `dot ${tone}` : "dot";
  $("again").hidden = !page || !result;
}

function drawCode() {
  if (showing && qrcode.checked && !codeDismissed) {
    drawQr(qrEncoder.encode(buildFrames(showing)), code, qrColors);
    code.hidden = false;
  } else {
    code.hidden = true;
  }
}

function describe(m: Message): string {
  return `cell ${decodeMove(m.payload)} seq ${m.seq} session ${m.session}`;
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

async function awaitMove() {
  receiving?.abort();
  receiving = undefined;
  if (!page || outcome(board) || turn(board) === me) return;
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
        accept: (leg) => accepts(board, session, leg, previousSession),
      });
    } catch (err) {
      if (!ctl.signal.aborted) log(`receive failed: ${err}`);
      return;
    }
    const cell = decodeMove(m.payload);
    if (cell === null || !isLegal(board, cell)) {
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
    moved(play(board, cell));
  }
}

function moved(next: Board) {
  board = next;
  render();
  drawCode();
  if (outcome(board)) log(`game over: ${outcome(board)}`);
  awaitMove();
  status();
}

function tap(cell: number) {
  if (!page || session === undefined || turn(board) !== me) return;
  if (!isLegal(board, cell)) return;
  lastSent = {
    type: MOVE,
    seq: moveCount(board) % 4,
    session,
    payload: encodeMove(cell),
  };
  ping.disabled = false;
  moved(play(board, cell));
  transmit(lastSent);
}

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

$("start").onclick = async () => {
  $("start").hidden = true;
  $("status").textContent = "opening devices";
  try {
    page = await openLink(code, camera);
    page.sound.log = log;
    // The two phones face each other screen to screen.
    page.qr.facing = "user";
  } catch (err) {
    log(`could not start: ${err}`);
    $("start").hidden = false;
    status();
    return;
  }
  log(
    `${role} playing ${me} at ${page.sampleRate} Hz, ${protocol.value}, ${passes()} passes, session ${
      session ?? "from the first move"
    }`,
  );
  ping.hidden = false;
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

function newGame(nextRole: "host" | "guest") {
  receiving?.abort();
  sounding?.abort();
  sounding = undefined;
  previousSession = session;
  setRole(nextRole);
  board = emptyBoard();
  lastSent = undefined;
  showing = undefined;
  ping.disabled = true;
  log(
    `new game: ${role} playing ${me}, session ${
      session ?? "from the first move"
    }`,
  );
  moved(board);
}

$("replay").onclick = () => newGame(role);
$("switch").onclick = () => newGame(role === "host" ? "guest" : "host");

render();
status();
