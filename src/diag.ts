// Diagnostic page: exercises the transports end to end on real devices.
import { Link } from "@/lib/link.ts";
import type { TransportId } from "@/lib/transport.ts";
import { buildFrames, type Leg, type Message } from "@/lib/frames/frames.ts";
import { MAX_SEQ, MAX_SESSION } from "@/lib/protocol.ts";
import { decodeText, encodeText } from "@/games/diag/codec.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { CodecWorker } from "@/adapters/codecWorker.ts";
import { SoundTransport } from "@/adapters/soundTransport.ts";
import { QrTransport } from "@/adapters/qrTransport.ts";
import { drawQr } from "@/adapters/screen.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const value = (id: string) => $<HTMLInputElement>(id).value;

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

const SECONDS_PER_FRAME: Record<SoundProtocol, number> = {
  fastest: 0.19,
  fast: 0.38,
  normal: 0.58,
  "ultrasound-fastest": 0.19,
  "ultrasound-fast": 0.38,
  "ultrasound-normal": 0.58,
};

/** Handshake phase, and the only thing that tells a message from our own echo. */
const CALL = 0;
const REPLY = 1;
const ACK = 2;
/** The last ack can never itself be acked, so it goes out a fixed few times. */
const ACK_PASSES = 2;
/** Ours for this page load, so a message we hear ourselves is recognisable. Never 1, which the e2e fixtures use for the peer. */
const SESSION_ID = 2 + Math.floor(Math.random() * (MAX_SESSION - 1));

/** Listen, scan and handshake share the mic and the worker, so only one runs. */
const RECEIVERS = ["listen", "scan", "receive-both", "handshake"];

let link: Link | undefined;
let sound: SoundTransport | undefined;
let qr: QrTransport | undefined;
let sending: AbortController | undefined;
let receiving: AbortController | undefined;
let turning: AbortController | undefined;
let seq = 0;
let selfSuppressed = 0;
const qrEncoder = new QrEncoder();

function textMessage(text: string, type = CALL, at?: number): Message {
  return {
    type,
    session: SESSION_ID,
    seq: at ?? (seq++ & MAX_SEQ),
    payload: encodeText(text),
  };
}

function protocol(): SoundProtocol {
  return value("send-protocol") as SoundProtocol;
}

function updateSend() {
  const frames = buildFrames(textMessage(value("send-text"), CALL, 0));
  drawQr(qrEncoder.encode(frames), $<HTMLCanvasElement>("qr-canvas"));
  const n = frames.length;
  $("send-estimate").textContent = `${n} frame${n === 1 ? "" : "s"}, about ${
    (n * (SECONDS_PER_FRAME[protocol()] + 0.15)).toFixed(1)
  } s per pass`;
}

/** Builds the worker and transports once, from a user gesture so iOS lets the audio context run. */
async function ensureLink(): Promise<
  { link: Link; sound: SoundTransport; qr: QrTransport } | undefined
> {
  if (link && sound && qr) return { link, sound, qr };
  const context = new AudioContext({ sampleRate: 48_000 });
  $("sample-rate").textContent = `${context.sampleRate} Hz`;
  $("worker-state").textContent = "loading";
  try {
    const worker = await CodecWorker.create(
      "./codec-worker.js",
      context.sampleRate,
    );
    sound = new SoundTransport(context, worker, "./capture-worklet.js");
    qr = new QrTransport(
      $<HTMLCanvasElement>("qr-canvas"),
      $<HTMLVideoElement>("camera"),
      worker,
    );
    link = new Link([sound, qr]);
    $("worker-state").textContent = "ready";
    $("session-id").textContent = String(SESSION_ID);
    log(`ready at ${context.sampleRate} Hz, session ${SESSION_ID}`);
    return { link, sound, qr };
  } catch (err) {
    $("worker-state").textContent = "failed";
    log(`start failed: ${err}`);
    return undefined;
  }
}

function syncDevices() {
  button("mic").textContent = sound?.listening ? "Turn off mic" : "Turn on mic";
  button("cam").textContent = qr?.watching
    ? "Turn off camera"
    : "Turn on camera";
  $("camera").hidden = !qr?.watching;
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

function busy(stop: string, on: boolean) {
  for (const id of RECEIVERS) button(id).disabled = on;
  button(stop).disabled = !on;
}

async function receive(via: TransportId[]) {
  const ready = await ensureLink();
  if (!ready) return;
  receiving = new AbortController();
  busy("receive-stop", true);
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
    busy("receive-stop", false);
    syncDevices();
  }
}

/** Listens for at most `ms` (Infinity to wait indefinitely) for a message `want` accepts. */
async function listenFor(
  via: TransportId[],
  ms: number,
  want: (leg: Leg) => boolean,
): Promise<Message | undefined> {
  if (!link) return undefined;
  const stop = new AbortController();
  const timer = Number.isFinite(ms)
    ? setTimeout(() => stop.abort(), ms)
    : undefined;
  const giveUp = () => stop.abort();
  turning?.signal.addEventListener("abort", giveUp, { once: true });
  try {
    return await link.receive(via, stop.signal, {
      accept: (e) => {
        if (!want(e)) {
          log(`ignored type ${e.type} seq ${e.seq} (not what we await)`);
          return false;
        }
        return notOurs(e);
      },
    });
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    turning?.signal.removeEventListener("abort", giveUp);
  }
}

function pauseFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Both sides retry on their own cadence, and if those cadences come out equal a
 * bad phase has them transmitting over each other forever. A little jitter on
 * every retry is what guarantees they eventually fall into step.
 */
function jitter(ms: number): Promise<void> {
  return pauseFor(Math.random() * ms);
}

/**
 * The three-leg exchange, which is the whole protocol: the caller transmits a
 * payload until the responder answers with one of its own, and the responder
 * repeats its answer until the caller acks. A device cannot hear anything over
 * its own speaker, so no leg overlaps another.
 *
 * Nothing here waits on a guessed interval. The responder answers the moment it
 * has a complete message, which phase-locks both sides to the end of a
 * transmission, so the caller knows exactly when an answer is due: one
 * turnaround plus one pass. `turnaround` is the only measured number — the time
 * a device needs to stop transmitting and have its microphone listening.
 *
 * The leg is the state and the channel is only delivery: the outgoing leg sits
 * on screen as a QR code for as long as it is current, and sound repeats it on
 * its cadence. Whichever channel decodes the awaited leg first wins. Showing a
 * code never blinds our own camera, so QR alone has no windows and no retries.
 */
async function handshake() {
  const ready = await ensureLink();
  if (!ready) return;
  const { link, sound, qr } = ready;
  const role = value("turn-role");
  const channel = value("handshake-via") as TransportId | "both";
  const via: TransportId[] = channel === "both" ? ["sound", "qr"] : [channel];
  const bySound = via.includes("sound");
  const byQr = via.includes("qr");
  const guardMs = Number(value("guard-ms"));
  const turnaroundMs = Number(value("turnaround-ms"));
  sound.protocol = protocol();
  const canvas = $<HTMLCanvasElement>("handshake-qr");
  canvas.hidden = true;
  turning = new AbortController();
  busy("handshake-stop", true);
  try {
    if (bySound) await sound.listen();
    if (byQr) await qr.watch();
  } catch (err) {
    log(`handshake failed: ${err}`);
    busy("handshake-stop", false);
    return;
  }
  syncDevices();
  const text = value("handshake-text");
  const round = 0;
  const mine = (type: number) => textMessage(text, type, round);
  const ackOnly = { ...mine(ACK), payload: new Uint8Array() };

  const frameMs = SECONDS_PER_FRAME[sound.protocol] * 1000 + sound.gapMs;
  const passMs = (m: Message) => buildFrames(m).length * frameMs;
  const window = (m: Message) =>
    bySound ? turnaroundMs + passMs(m) + guardMs : Infinity;
  const replyWindow = window(mine(REPLY));
  const ackWindow = window(ackOnly);
  /** Puts the leg on screen and, over sound, plays it the given passes. */
  const transmit = async (m: Message, passes = 1) => {
    if (byQr) {
      drawQr(qrEncoder.encode(buildFrames(m)), canvas);
      canvas.hidden = false;
    }
    if (bySound) {
      sound.maxPasses = passes;
      await link.send(m, "sound", turning!.signal);
    }
  };
  const await_ = (want: (e: Leg) => boolean, ms: number) =>
    listenFor(via, ms, want);

  $("handshake-received").textContent = "";
  const started = performance.now();
  const at = () => ((performance.now() - started) / 1000).toFixed(2);
  const status = (s: string) => {
    $("handshake-progress").textContent = s;
  };
  const show = (m: Message) => {
    $("handshake-received").textContent = decodeText(m.payload);
  };

  log(
    `handshake as ${role} over ${via.join(" + ")}${
      bySound ? ` (${sound.protocol})` : ""
    }: one pass ${
      (passMs(mine(CALL)) / 1000).toFixed(2)
    } s, reply due within ${replyWindow} ms, ack within ${ackWindow} ms`,
  );
  try {
    if (role === "host") {
      for (let attempt = 1; !turning.signal.aborted; attempt++) {
        status(`call ${attempt}: transmitting`);
        log(`call ${attempt}: transmitting at ${at()} s`);
        await transmit(mine(CALL));
        status(`call ${attempt}: awaiting reply`);
        const reply = await await_(
          (e) => e.type === REPLY && e.seq === round,
          replyWindow,
        );
        if (!reply) {
          log(
            `call ${attempt}: no reply within ${replyWindow} ms, calling again`,
          );
          await jitter(frameMs);
          continue;
        }
        show(reply);
        log(`call ${attempt}: reply at ${at()} s, acking`);
        await pauseFor(turnaroundMs);
        await transmit(ackOnly, ACK_PASSES);
        status(`done in ${at()} s`);
        log(`handshake complete in ${at()} s`);
        return;
      }
    } else {
      status("awaiting a call");
      const call = await await_((e) => e.type === CALL, Infinity);
      if (!call) return;
      show(call);
      log(`call heard at ${at()} s, replying`);
      for (let attempt = 1; !turning.signal.aborted; attempt++) {
        await pauseFor(turnaroundMs);
        status(`reply ${attempt}: transmitting`);
        log(`reply ${attempt}: transmitting at ${at()} s`);
        await transmit(mine(REPLY));
        status(`reply ${attempt}: awaiting ack`);
        const ack = await await_(
          (e) => e.type === ACK && e.seq === call.seq,
          ackWindow,
        );
        if (ack) {
          status(`done in ${at()} s`);
          log(`handshake complete in ${at()} s`);
          return;
        }
        log(`reply ${attempt}: no ack within ${ackWindow} ms, replying again`);
        await jitter(frameMs);
      }
    }
    status("stopped");
  } catch (err) {
    if (!turning.signal.aborted) log(`handshake failed: ${err}`);
  } finally {
    turning.abort();
    sound.maxPasses = Infinity;
    busy("handshake-stop", false);
    syncDevices();
  }
}

button("mic").onclick = () =>
  toggle(
    "mic",
    () => sound!.listening,
    () => sound!.listen(),
    () => sound!.stopListening(),
  );
button("cam").onclick = () =>
  toggle(
    "cam",
    () => qr!.watching,
    () => qr!.watch(),
    () => qr!.stopWatching(),
  );
button("play").onclick = play;
button("play-stop").onclick = () => sending?.abort();
button("listen").onclick = () => receive(["sound"]);
button("scan").onclick = () => receive(["qr"]);
button("receive-both").onclick = () => receive(["sound", "qr"]);
button("receive-stop").onclick = () => receiving?.abort();
button("handshake").onclick = handshake;
button("handshake-stop").onclick = () => turning?.abort();
for (const id of ["send-text", "send-protocol"]) $(id).oninput = updateSend;
updateSend();
