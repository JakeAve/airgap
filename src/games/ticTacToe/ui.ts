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
const role = params.get("role") === "guest" ? "guest" : "host";
const passesParam = Number(params.get("passes"));
const passes = Number.isInteger(passesParam) && passesParam > 0
  ? passesParam
  : 3;
const protocol = (params.get("protocol") ?? "fastest") as SoundProtocol;
const me: Mark = role === "host" ? "X" : "O";
const them: Mark = me === "X" ? "O" : "X";
const qrColors = role === "guest" ? QR_GUEST_COLORS : QR_COLORS;

const chirp = $<HTMLInputElement>("chirp");
const qrcode = $<HTMLInputElement>("qrcode");
const code = $<HTMLCanvasElement>("code");
const camera = $<HTMLVideoElement>("camera");
const resend = $<HTMLButtonElement>("resend");
const qrEncoder = new QrEncoder();

let page: PageLink | undefined;
let board: Board = emptyBoard();
let session = role === "host" ? newSessionId() : undefined;
let lastSent: Message | undefined;
let showing: Message | undefined;
let sounding: AbortController | undefined;
let receiving: AbortController | undefined;

document.body.classList.add(role);

const cells = Array.from({ length: 9 }, (_, cell) => {
  const el = document.createElement("button");
  el.onclick = () => tap(cell);
  $("board").append(el);
  return el;
});

function render() {
  cells.forEach((el, cell) => {
    const mark = board[cell];
    el.textContent = mark ?? "";
    el.setAttribute(
      "aria-label",
      `row ${Math.floor(cell / 3) + 1} column ${(cell % 3) + 1}, ${
        mark ?? "empty"
      }`,
    );
  });
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
}

function drawCode() {
  if (showing && qrcode.checked) {
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
  drawCode();
  log(`sent ${describe(m)} over ${channels().join(" + ") || "nothing"}`);
  if (page && chirp.checked) {
    const ctl = new AbortController();
    sounding = ctl;
    page.sound.maxPasses = passes;
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
        accept: (leg) => accepts(board, session, leg),
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
  resend.disabled = false;
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
    // The two phones face each other screen to screen.
    page.qr.facing = "user";
    page.sound.protocol = protocol;
  } catch (err) {
    log(`could not start: ${err}`);
    $("start").hidden = false;
    status();
    return;
  }
  log(
    `${role} playing ${me} at ${page.sampleRate} Hz, ${protocol}, ${passes} passes, session ${
      session ?? "from the first move"
    }`,
  );
  resend.hidden = false;
  await syncChannels();
};

chirp.onchange = syncChannels;
qrcode.onchange = syncChannels;
resend.onclick = () => {
  if (lastSent) transmit(lastSent);
};

render();
status();
