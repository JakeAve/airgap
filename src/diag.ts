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
};
const DIAG_GAME_ID = 0;

let link: Link | undefined;
let sound: SoundTransport | undefined;
let sending: AbortController | undefined;
let receiving: AbortController | undefined;
let seq = 0;

function textEnvelope(text: string): Envelope {
  return {
    type: 0,
    gameId: DIAG_GAME_ID,
    sessionId: 1,
    seq: seq++ & 63,
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
    $("send-card").hidden = false;
    $("receive-card").hidden = false;
    updateEstimate();
    log(`ready at ${context.sampleRate} Hz`);
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

async function receive(via: TransportId[]) {
  if (!link) return;
  receiving = new AbortController();
  for (const id of ["listen", "scan", "receive-both"]) {
    $<HTMLButtonElement>(id).disabled = true;
  }
  $<HTMLButtonElement>("receive-stop").disabled = false;
  $("camera").hidden = !via.includes("qr");
  $("receive-progress").textContent = `waiting on ${via.join(" + ")}`;
  $("received-text").textContent = "";
  log(`receiving via ${via.join(" + ")}`);
  const started = performance.now();
  try {
    const envelope = await link.receive(via, receiving.signal, (p) => {
      $("receive-progress").textContent = `frames ${p.received} of ${p.total}`;
      log(
        `frame ${p.received}/${p.total} at ${
          ((performance.now() - started) / 1000).toFixed(2)
        } s`,
      );
    });
    const text = new TextDecoder().decode(envelope.payload);
    $("received-text").textContent = text;
    $("receive-progress").textContent = `done in ${
      ((performance.now() - started) / 1000).toFixed(2)
    } s`;
    log(`received "${text}" (seq ${envelope.seq})`);
  } catch (err) {
    $("receive-progress").textContent = receiving.signal.aborted
      ? "stopped"
      : `failed: ${err}`;
    if (!receiving.signal.aborted) log(`receive failed: ${err}`);
  } finally {
    receiving.abort();
    for (const id of ["listen", "scan", "receive-both"]) {
      $<HTMLButtonElement>(id).disabled = false;
    }
    $<HTMLButtonElement>("receive-stop").disabled = true;
    $("camera").hidden = true;
  }
}

$("start").onclick = start;
$("send").onclick = send;
$("send-stop").onclick = () => sending?.abort();
$("listen").onclick = () => receive(["sound"]);
$("scan").onclick = () => receive(["qr"]);
$("receive-both").onclick = () => receive(["sound", "qr"]);
$("receive-stop").onclick = () => receiving?.abort();
for (const id of ["send-text", "send-via", "send-protocol"]) {
  $(id).oninput = updateEstimate;
}
