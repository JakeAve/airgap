// The exchange screen: one round of call, reply and ack, over sound, QR, or
// both, driven by URL parameters so two phones can share one link.
import type { TransportId } from "@/lib/transport.ts";
import { buildFrames, type Leg, type Message } from "@/lib/frames/frames.ts";
import { decodeText, encodeText } from "@/games/diag/codec.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { drawQr } from "@/adapters/screen.ts";
import {
  newSessionId,
  openLink,
  type PageLink,
  SECONDS_PER_FRAME,
} from "@/adapters/pageLink.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);

const log = (line: string) => {
  const el = $<HTMLPreElement>("log");
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
};

/** Handshake phase, and the only thing that tells a message from our own echo. */
const CALL = 0;
const REPLY = 1;
const ACK = 2;
const SESSION_ID = newSessionId();

const params = new URLSearchParams(location.search);
const param = (name: string, fallback: string) => params.get(name) ?? fallback;
const role = param("role", "host");
const channel = param("via", "both");
const via: TransportId[] = channel === "both"
  ? ["sound", "qr"]
  : [channel as TransportId];
const bySound = via.includes("sound");
const byQr = via.includes("qr");
const text = param("text", "hello airgap");
const protocol = param("protocol", "fastest") as SoundProtocol;
const turnaroundMs = Number(param("turnaround", "50"));
const guardMs = Number(param("guard", "100"));
const retries = Number(param("retries", "5"));
const next = param("next", "./diag.html");

const qrEncoder = new QrEncoder();
let page: PageLink | undefined;
let turning: AbortController | undefined;
let selfSuppressed = 0;

$("role").textContent = `${role} · ${channel}`;

function textMessage(type: number): Message {
  return { type, session: SESSION_ID, seq: 0, payload: encodeText(text) };
}

function status(s: string, tone: "rx" | "tx" | "" = "rx") {
  $("status").textContent = s;
  $("status").className = tone === "" ? "mono muted" : `mono ${tone}-text`;
  $("dot").className = tone === "" ? "dot" : `dot ${tone}`;
}

/** Anything carrying our own session id is our own speaker coming back at us. */
function notOurs(leg: Leg): boolean {
  if (leg.session !== SESSION_ID) return true;
  selfSuppressed++;
  log(`ignored our own frame (seq ${leg.seq})`);
  return false;
}

/** Listens for at most `ms` (Infinity to wait indefinitely) for a message `want` accepts. */
async function listenFor(
  ms: number,
  want: (leg: Leg) => boolean,
): Promise<Message | undefined> {
  if (!page) return undefined;
  const stop = new AbortController();
  const timer = Number.isFinite(ms)
    ? setTimeout(() => stop.abort(), ms)
    : undefined;
  const giveUp = () => stop.abort();
  turning?.signal.addEventListener("abort", giveUp, { once: true });
  try {
    return await page.link.receive(via, stop.signal, {
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

function syncDevices() {
  $("camera").hidden = !page?.qr.watching;
  button("flip").hidden = !page?.qr.watching;
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
async function start() {
  button("start").hidden = true;
  button("stop").hidden = false;
  const started = performance.now();
  const at = () => ((performance.now() - started) / 1000).toFixed(2);
  const ticker = setInterval(() => {
    $("elapsed").textContent = `${at()} s`;
  }, 100);
  turning = new AbortController();
  let outcome = "stopped";
  let received = "";
  try {
    status("opening devices");
    page ??= await openLink(
      $<HTMLCanvasElement>("code"),
      $<HTMLVideoElement>("camera"),
    );
    const { link, sound, qr } = page;
    sound.protocol = protocol;
    if (bySound) await sound.listen();
    if (byQr) await qr.watch();
    syncDevices();
    log(`ready at ${page.sampleRate} Hz, session ${SESSION_ID}`);

    const mine = (type: number) => textMessage(type);
    const ackOnly = { ...mine(ACK), payload: new Uint8Array() };
    const frameMs = SECONDS_PER_FRAME[protocol] * 1000 + sound.gapMs;
    const passMs = (m: Message) => buildFrames(m).length * frameMs;
    const window = (m: Message) =>
      bySound ? turnaroundMs + passMs(m) + guardMs : Infinity;
    const replyWindow = window(mine(REPLY));
    const ackWindow = window(ackOnly);
    /**
     * The last ack cannot itself be acked, so after sending it the host stays
     * listening for one guest retry: the ack window, its jitter, a turnaround
     * and a reply pass. A repeated reply means the guest missed the ack, so it
     * goes out again; silence for that long means the guest has it.
     */
    const lingerMs = bySound
      ? ackWindow + frameMs + turnaroundMs + passMs(mine(REPLY)) + guardMs
      : 1000;
    /** Puts the leg on screen and, over sound, plays it once. */
    const transmit = async (m: Message) => {
      if (byQr) {
        drawQr(qrEncoder.encode(buildFrames(m)), $<HTMLCanvasElement>("code"));
        $("code").hidden = false;
      }
      if (bySound) {
        sound.maxPasses = 1;
        await link.send(m, "sound", turning!.signal);
      }
    };
    const show = (m: Message) => {
      received = decodeText(m.payload);
    };

    log(
      `handshake as ${role} over ${via.join(" + ")}${
        bySound ? ` (${protocol})` : ""
      }: one pass ${
        (passMs(mine(CALL)) / 1000).toFixed(2)
      } s, reply due within ${replyWindow} ms, ack within ${ackWindow} ms, linger ${lingerMs} ms after acking`,
    );

    if (role === "host") {
      for (
        let attempt = 1;
        attempt <= retries && !turning.signal.aborted;
        attempt++
      ) {
        status(`call ${attempt}: transmitting`, "tx");
        log(`call ${attempt}: transmitting at ${at()} s`);
        await transmit(mine(CALL));
        status(`call ${attempt}: awaiting reply`);
        const reply = await listenFor(
          replyWindow,
          (e) => e.type === REPLY && e.seq === 0,
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
        for (let ack = 1; !turning.signal.aborted; ack++) {
          await pauseFor(turnaroundMs);
          status(`ack ${ack}: transmitting`, "tx");
          await transmit(ackOnly);
          status(`ack ${ack}: lingering for a repeated reply`);
          const repeat = await listenFor(
            lingerMs,
            (e) => e.type === REPLY && e.seq === 0,
          );
          if (!repeat) break;
          log(`ack ${ack}: reply repeated at ${at()} s, acking again`);
        }
        if (turning.signal.aborted) return;
        outcome = `complete in ${at()} s`;
        return;
      }
      if (!turning.signal.aborted) {
        outcome = `failed: no reply to ${retries} calls in ${at()} s`;
      }
    } else {
      status("awaiting a call");
      const call = await listenFor(Infinity, (e) => e.type === CALL);
      if (!call) return;
      show(call);
      log(`call heard at ${at()} s, replying`);
      for (
        let attempt = 1;
        attempt <= retries && !turning.signal.aborted;
        attempt++
      ) {
        await pauseFor(turnaroundMs);
        status(`reply ${attempt}: transmitting`, "tx");
        log(`reply ${attempt}: transmitting at ${at()} s`);
        await transmit(mine(REPLY));
        status(`reply ${attempt}: awaiting ack`);
        const ack = await listenFor(
          ackWindow,
          (e) => e.type === ACK && e.seq === call.seq,
        );
        if (ack) {
          outcome = `complete in ${at()} s`;
          return;
        }
        log(`reply ${attempt}: no ack within ${ackWindow} ms, replying again`);
        await jitter(frameMs);
      }
      if (!turning.signal.aborted) {
        outcome = `failed: no ack to ${retries} replies in ${at()} s`;
      }
    }
  } catch (err) {
    if (!turning.signal.aborted) outcome = `failed after ${at()} s: ${err}`;
  } finally {
    turning.abort();
    clearInterval(ticker);
    page?.sound.stopListening();
    page?.qr.stopWatching();
    syncDevices();
    log(
      `handshake ${outcome}, mic and camera off, ${selfSuppressed} own frames ignored`,
    );
    status(outcome, outcome.startsWith("complete") ? "rx" : "");
    $("elapsed").textContent = "";
    $("code").hidden = true;
    button("stop").hidden = true;
    $("outcome").textContent = outcome;
    $("received").textContent = received;
    $("result").hidden = false;
    button("continue").hidden = false;
  }
}

button("start").onclick = start;
button("stop").onclick = () => turning?.abort();
button("continue").onclick = () => {
  location.href = next;
};
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
status(
  `ready · ${text} · ${channel}${bySound ? ` · ${protocol}` : ""}`,
  "",
);
