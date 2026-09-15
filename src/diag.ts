// Diagnostic page: exercises the transports end to end on real devices.
import type { TransportId } from "@/lib/transport.ts";
import { buildFrames, type Leg, type Message } from "@/lib/frames/frames.ts";
import { MAX_SEQ } from "@/lib/protocol.ts";
import { decodeText, encodeText } from "@/games/diag/codec.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { drawQr } from "@/adapters/screen.ts";
import { startApp } from "@/adapters/app.ts";
import {
  newSessionId,
  openLink,
  type PageLink,
  SECONDS_PER_FRAME,
} from "@/adapters/pageLink.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const value = (id: string) => $<HTMLInputElement>(id).value;

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

/** Every message here is a plain call; the handshake page owns the other legs. */
const CALL = 0;
const SESSION_ID = newSessionId();

/** Listen, scan and both share the mic and the worker, so only one runs. */
const RECEIVERS = ["listen", "scan", "receive-both"];

let page: PageLink | undefined;
let sending: AbortController | undefined;
let receiving: AbortController | undefined;
let seq = 0;
let selfSuppressed = 0;
const qrEncoder = new QrEncoder();

function textMessage(text: string, at?: number): Message {
  return {
    type: CALL,
    session: SESSION_ID,
    seq: at ?? (seq++ & MAX_SEQ),
    payload: encodeText(text),
  };
}

function protocol(): SoundProtocol {
  return value("send-protocol") as SoundProtocol;
}

function updateSend() {
  const frames = buildFrames(textMessage(value("send-text"), 0));
  drawQr(qrEncoder.encode(frames), $<HTMLCanvasElement>("qr-canvas"));
  const n = frames.length;
  $("send-estimate").textContent = `${n} frame${n === 1 ? "" : "s"}, about ${
    (n * (SECONDS_PER_FRAME[protocol()] + 0.15)).toFixed(1)
  } s per pass`;
}

/** Builds the worker and transports once, from a user gesture so iOS lets the audio context run. */
async function ensureLink(): Promise<PageLink | undefined> {
  if (page) return page;
  $("worker-state").textContent = "loading";
  try {
    page = await openLink(
      $<HTMLCanvasElement>("qr-canvas"),
      $<HTMLVideoElement>("camera"),
    );
    page.sound.log = log;
    $("sample-rate").textContent = `${page.sampleRate} Hz`;
    $("worker-state").textContent = "ready";
    $("session-id").textContent = String(SESSION_ID);
    log(`ready at ${page.sampleRate} Hz, session ${SESSION_ID}`);
    return page;
  } catch (err) {
    $("worker-state").textContent = "failed";
    log(`start failed: ${err}`);
    return undefined;
  }
}

function syncDevices() {
  button("mic").textContent = page?.sound.listening
    ? "Turn off mic"
    : "Turn on mic";
  button("cam").textContent = page?.qr.watching
    ? "Turn off camera"
    : "Turn on camera";
  $("camera").hidden = !page?.qr.watching;
  $("flip").hidden = !page?.qr.watching;
}

/** Turns a device on or off; both stay rolling between legs so nothing waits on `getUserMedia`. */
async function toggle(
  id: "mic" | "cam",
  isOn: () => boolean,
  on: () => Promise<void>,
  off: () => void,
) {
  button(id).disabled = true;
  try {
    if (!(await ensureLink())) return;
    if (isOn()) {
      off();
      log(`${id} off`);
    } else {
      await on();
      log(`${id} on`);
    }
  } catch (err) {
    log(`${id} failed: ${err}`);
  } finally {
    button(id).disabled = false;
    syncDevices();
  }
}

async function play() {
  const ready = await ensureLink();
  if (!ready) return;
  const text = value("send-text");
  ready.sound.protocol = protocol();
  ready.sound.maxPasses = Infinity;
  sending = new AbortController();
  button("play").disabled = true;
  button("play-stop").disabled = false;
  log(`sending ${text.length} chars via sound (${ready.sound.protocol})`);
  try {
    await ready.link.send(textMessage(text), "sound", sending.signal);
  } catch (err) {
    log(`send failed: ${err}`);
  } finally {
    button("play").disabled = false;
    button("play-stop").disabled = true;
    log("send stopped");
  }
}

/** Anything carrying our own session id is our own speaker coming back at us. */
function notOurs(leg: Leg): boolean {
  if (leg.session !== SESSION_ID) return true;
  selfSuppressed++;
  $("self-suppressed").textContent = String(selfSuppressed);
  log(`ignored our own frame (seq ${leg.seq})`);
  return false;
}

function busy(on: boolean) {
  for (const id of RECEIVERS) button(id).disabled = on;
  button("receive-stop").disabled = !on;
}

async function receive(via: TransportId[]) {
  const ready = await ensureLink();
  if (!ready) return;
  receiving = new AbortController();
  busy(true);
  $("camera").hidden = !via.includes("qr");
  $("receive-progress").textContent = `waiting on ${via.join(" + ")}`;
  $("received-text").textContent = "";
  log(`receiving via ${via.join(" + ")}`);
  const started = performance.now();
  const at = () => ((performance.now() - started) / 1000).toFixed(2);
  try {
    const message = await ready.link.receive(via, receiving.signal, {
      onProgress: (p) => {
        $("receive-progress").textContent =
          `frames ${p.received} of ${p.total}`;
        log(`frame ${p.received}/${p.total} at ${at()} s`);
      },
      accept: notOurs,
    });
    const text = decodeText(message.payload);
    $("received-text").textContent = text;
    $("receive-progress").textContent = `done in ${at()} s`;
    log(`received "${text}" (seq ${message.seq})`);
  } catch (err) {
    $("receive-progress").textContent = receiving.signal.aborted
      ? "stopped"
      : `failed: ${err}`;
    if (!receiving.signal.aborted) log(`receive failed: ${err}`);
  } finally {
    receiving.abort();
    busy(false);
    syncDevices();
  }
}

button("mic").onclick = () =>
  toggle(
    "mic",
    () => page!.sound.listening,
    () => page!.sound.listen(),
    () => page!.sound.stopListening(),
  );
button("cam").onclick = () =>
  toggle(
    "cam",
    () => page!.qr.watching,
    () => page!.qr.watch(),
    () => page!.qr.stopWatching(),
  );
button("flip").onclick = async () => {
  button("flip").disabled = true;
  try {
    await page?.qr.flip();
    log(`camera facing ${page?.qr.facing}`);
  } catch (err) {
    log(`flip failed: ${err}`);
  } finally {
    button("flip").disabled = false;
    syncDevices();
  }
};
button("play").onclick = play;
button("play-stop").onclick = () => sending?.abort();
button("listen").onclick = () => receive(["sound"]);
button("scan").onclick = () => receive(["qr"]);
button("receive-both").onclick = () => receive(["sound", "qr"]);
button("receive-stop").onclick = () => receiving?.abort();
for (const id of ["send-text", "send-protocol"]) $(id).oninput = updateSend;
updateSend();
startApp({ home: false });
