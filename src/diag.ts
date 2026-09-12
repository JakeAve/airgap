// Diagnostic page: exercises the transports end to end on real devices.
import { Link } from "@/lib/link.ts";
import type { TransportId } from "@/lib/transport.ts";
import { encodeEnvelope, type Envelope } from "@/lib/envelope/envelope.ts";
import { buildFrames } from "@/lib/frames/frames.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { CodecWorker } from "@/adapters/codecWorker.ts";
import { SoundTransport } from "@/adapters/soundTransport.ts";
import { QrTransport } from "@/adapters/qrTransport.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

const SECONDS_PER_FRAME: Record<SoundProtocol, number> = {
  fastest: 0.51,
  fast: 1.02,
  normal: 1.54,
  "ultrasound-fastest": 0.51,
  "ultrasound-fast": 1.02,
  "ultrasound-normal": 1.54,
};
const DIAG_GAME_ID = 0;

/** Handshake phase, and the only thing that tells a message from our own echo. */
const CALL = 0;
const REPLY = 1;
const ACK = 2;
/** The last ack can never itself be acked, so it goes out a fixed few times. */
const ACK_PASSES = 2;
/** Ours for this page load, so a message we hear ourselves is recognisable. Never 1, which the e2e fixtures use for the peer. */
const SESSION_ID = 2 + Math.floor(Math.random() * 4094);

let link: Link | undefined;
let sound: SoundTransport | undefined;
let sending: AbortController | undefined;
let receiving: AbortController | undefined;
let turning: AbortController | undefined;
let seq = 0;
let selfSuppressed = 0;

function textEnvelope(text: string, type = CALL, at?: number): Envelope {
  return {
    type,
    gameId: DIAG_GAME_ID,
    sessionId: SESSION_ID,
    seq: at ?? (seq++ & 63),
    payload: new TextEncoder().encode(text),
  };
}

function updateEstimate() {
  const text = $<HTMLInputElement>("send-text").value;
  const via = $<HTMLSelectElement>("send-via").value as TransportId;
  const protocol = $<HTMLSelectElement>("send-protocol").value as SoundProtocol;
  const frames = buildFrames(encodeEnvelope(textEnvelope(text)), 0).length;
  seq--;
  const estimate = via === "sound"
    ? `${frames} frame${frames === 1 ? "" : "s"}, about ${
      (frames * (SECONDS_PER_FRAME[protocol] + 0.15)).toFixed(1)
    } s per pass`
    : `${frames} frame${frames === 1 ? "" : "s"} in ${
      Math.ceil(frames / 32)
    } code${frames > 32 ? "s" : ""}`;
  $("send-estimate").textContent = estimate;
}

async function start() {
  $<HTMLButtonElement>("start").disabled = true;
  const context = new AudioContext({ sampleRate: 48_000 });
  $("sample-rate").textContent = `${context.sampleRate} Hz`;
  $("worker-state").textContent = "loading";
  try {
    const worker = await CodecWorker.create(
      "./codec-worker.js",
      context.sampleRate,
    );
    $("worker-state").textContent = "ready";
    sound = new SoundTransport(context, worker, "./capture-worklet.js");
    const qr = new QrTransport(
      $<HTMLCanvasElement>("qr-canvas"),
      $<HTMLVideoElement>("camera"),
      worker,
    );
    link = new Link([sound, qr]);
    await sound.listen();
    $("mic-state").textContent = "rolling";
    $("send-card").hidden = false;
    $("receive-card").hidden = false;
    updateEstimate();
    $("session-id").textContent = String(SESSION_ID);
    log(`ready at ${context.sampleRate} Hz, session ${SESSION_ID}`);
  } catch (err) {
    $("worker-state").textContent = "failed";
    log(`start failed: ${err}`);
    $<HTMLButtonElement>("start").disabled = false;
  }
}

async function send() {
  if (!link || !sound) return;
  const text = $<HTMLInputElement>("send-text").value;
  const via = $<HTMLSelectElement>("send-via").value as TransportId;
  sound.protocol = $<HTMLSelectElement>("send-protocol").value as SoundProtocol;
  sound.maxPasses = Infinity;
  sending = new AbortController();
  $<HTMLButtonElement>("send").disabled = true;
  $<HTMLButtonElement>("send-stop").disabled = false;
  log(`sending ${text.length} chars via ${via}`);
  try {
    await link.send(textEnvelope(text), via, sending.signal);
  } catch (err) {
    log(`send failed: ${err}`);
  } finally {
    $<HTMLButtonElement>("send").disabled = false;
    $<HTMLButtonElement>("send-stop").disabled = true;
    log("send stopped");
  }
}

/** Anything carrying our own session id is our own speaker coming back at us. */
function notOurs(envelope: Envelope): boolean {
  if (envelope.sessionId !== SESSION_ID) return true;
  selfSuppressed++;
  $("self-suppressed").textContent = String(selfSuppressed);
  log(`ignored our own message (seq ${envelope.seq})`);
  return false;
}

async function receive(via: TransportId[]): Promise<Envelope | undefined> {
  if (!link) return undefined;
  receiving = new AbortController();
  for (
    const id of ["listen", "scan", "receive-both", "exchange", "handshake"]
  ) {
    $<HTMLButtonElement>(id).disabled = true;
  }
  $<HTMLButtonElement>("receive-stop").disabled = false;
  $("camera").hidden = !via.includes("qr");
  $("receive-progress").textContent = `waiting on ${via.join(" + ")}`;
  $("received-text").textContent = "";
  log(`receiving via ${via.join(" + ")}`);
  const started = performance.now();
  try {
    const envelope = await link.receive(via, receiving.signal, {
      onProgress: (p) => {
        $("receive-progress").textContent =
          `frames ${p.received} of ${p.total}`;
        log(
          `frame ${p.received}/${p.total} at ${
            ((performance.now() - started) / 1000).toFixed(2)
          } s`,
        );
      },
      accept: notOurs,
    });
    const text = new TextDecoder().decode(envelope.payload);
    $("received-text").textContent = text;
    $("receive-progress").textContent = `done in ${
      ((performance.now() - started) / 1000).toFixed(2)
    } s`;
    log(`received "${text}" (seq ${envelope.seq})`);
    return envelope;
  } catch (err) {
    $("receive-progress").textContent = receiving.signal.aborted
      ? "stopped"
      : `failed: ${err}`;
    if (!receiving.signal.aborted) log(`receive failed: ${err}`);
  } finally {
    receiving.abort();
    for (
      const id of ["listen", "scan", "receive-both", "exchange", "handshake"]
    ) {
      $<HTMLButtonElement>(id).disabled = false;
    }
    $<HTMLButtonElement>("receive-stop").disabled = true;
    $("camera").hidden = true;
  }
  return undefined;
}

/**
 * Transmits and listens at the same time, the way a real exchange will: the
 * peer's message is the only proof they heard ours, so hearing it is what stops
 * us transmitting.
 */
async function exchange() {
  const sendDone = send();
  try {
    const heard = await receive(["sound", "qr"]);
    if (heard) {
      log(
        sending?.signal.aborted
          ? "peer heard only after we stopped transmitting"
          : "peer heard while we were still transmitting",
      );
    }
  } finally {
    sending?.abort();
    await sendDone;
  }
}

/** Listens for at most `ms` (Infinity to wait indefinitely) for a message `want` accepts. */
async function listenFor(
  via: TransportId[],
  ms: number,
  want?: (envelope: Envelope) => boolean,
): Promise<Envelope | undefined> {
  if (!link) return undefined;
  const stop = new AbortController();
  const timer = Number.isFinite(ms)
    ? setTimeout(() => stop.abort(), ms)
    : undefined;
  const giveUp = () => stop.abort();
  turning?.signal.addEventListener("abort", giveUp, { once: true });
  $("camera").hidden = !via.includes("qr");
  try {
    return await link.receive(via, stop.signal, {
      accept: (e) => {
        if (want && !want(e)) {
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
    $("camera").hidden = true;
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
 */
async function handshake() {
  if (!link || !sound) return;
  const role = $<HTMLSelectElement>("turn-role").value;
  const guardMs = Number($<HTMLInputElement>("guard-ms").value);
  const turnaroundMs = Number($<HTMLInputElement>("turnaround-ms").value);
  const via = $<HTMLSelectElement>("send-via").value as TransportId;
  sound.protocol = $<HTMLSelectElement>("send-protocol").value as SoundProtocol;
  sound.maxPasses = 1;
  await sound.listen();
  const text = $<HTMLInputElement>("send-text").value;
  const round = 0;
  const mine = (type: number) => textEnvelope(text, type, round);
  const ackOnly = { ...mine(ACK), payload: new Uint8Array() };

  const frameMs = SECONDS_PER_FRAME[sound.protocol] * 1000 + sound.gapMs;
  const passMs = (e: Envelope) =>
    buildFrames(encodeEnvelope(e), 0).length * frameMs;
  const replyWindow = turnaroundMs + passMs(mine(REPLY)) + guardMs;
  const ackWindow = turnaroundMs + passMs(ackOnly) + guardMs;

  turning = new AbortController();
  const ids = ["listen", "scan", "receive-both", "exchange", "handshake"];
  for (const id of ids) $<HTMLButtonElement>(id).disabled = true;
  $<HTMLButtonElement>("receive-stop").disabled = false;
  $("received-text").textContent = "";
  const started = performance.now();
  const at = () => ((performance.now() - started) / 1000).toFixed(2);
  const show = (e: Envelope) => {
    $("received-text").textContent = new TextDecoder().decode(e.payload);
  };

  log(
    `handshake as ${role} over ${via}: one pass ${
      (passMs(mine(CALL)) / 1000).toFixed(2)
    } s, reply due within ${replyWindow} ms, ack within ${ackWindow} ms`,
  );
  try {
    if (role === "host") {
      for (let attempt = 1; !turning.signal.aborted; attempt++) {
        $("receive-progress").textContent = `call ${attempt}: transmitting`;
        log(`call ${attempt}: transmitting at ${at()} s`);
        await link.send(mine(CALL), via, turning.signal);
        $("receive-progress").textContent = `call ${attempt}: awaiting reply`;
        const reply = await listenFor(
          [via],
          replyWindow,
          (e) => e.type === REPLY && e.seq === round,
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
        sound.maxPasses = ACK_PASSES;
        await link.send(ackOnly, via, turning.signal);
        $("receive-progress").textContent = `done in ${at()} s`;
        log(`handshake complete in ${at()} s`);
        return;
      }
    } else {
      $("receive-progress").textContent = "awaiting a call";
      const call = await listenFor([via], Infinity, (e) => e.type === CALL);
      if (!call) return;
      show(call);
      log(`call heard at ${at()} s, replying`);
      for (let attempt = 1; !turning.signal.aborted; attempt++) {
        await pauseFor(turnaroundMs);
        $("receive-progress").textContent = `reply ${attempt}: transmitting`;
        log(`reply ${attempt}: transmitting at ${at()} s`);
        await link.send(mine(REPLY), via, turning.signal);
        $("receive-progress").textContent = `reply ${attempt}: awaiting ack`;
        const ack = await listenFor(
          [via],
          ackWindow,
          (e) => e.type === ACK && e.seq === call.seq,
        );
        if (ack) {
          $("receive-progress").textContent = `done in ${at()} s`;
          log(`handshake complete in ${at()} s`);
          return;
        }
        log(`reply ${attempt}: no ack within ${ackWindow} ms, replying again`);
        await jitter(frameMs);
      }
    }
  } catch (err) {
    if (!turning.signal.aborted) log(`handshake failed: ${err}`);
  } finally {
    turning.abort();
    sound.maxPasses = Infinity;
    for (const id of ids) $<HTMLButtonElement>(id).disabled = false;
    $<HTMLButtonElement>("receive-stop").disabled = true;
  }
}

$("start").onclick = start;
$("send").onclick = send;
$("send-stop").onclick = () => sending?.abort();
$("listen").onclick = () => receive(["sound"]);
$("scan").onclick = () => receive(["qr"]);
$("receive-both").onclick = () => receive(["sound", "qr"]);
$("exchange").onclick = exchange;
$("handshake").onclick = handshake;
$("receive-stop").onclick = () => {
  receiving?.abort();
  turning?.abort();
};
for (const id of ["send-text", "send-via", "send-protocol"]) {
  $(id).oninput = updateEstimate;
}
