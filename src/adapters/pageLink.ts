import { Link } from "@/lib/link.ts";
import { MAX_SESSION } from "@/lib/protocol.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { CodecWorker } from "./codecWorker.ts";
import { SoundTransport } from "./soundTransport.ts";
import { QrTransport } from "./qrTransport.ts";

/** Seconds one frame takes on air per protocol, for estimates and windows. */
export const SECONDS_PER_FRAME: Record<SoundProtocol, number> = {
  fastest: 0.19,
  fast: 0.38,
  normal: 0.58,
  "ultrasound-fastest": 0.19,
  "ultrasound-fast": 0.38,
  "ultrasound-normal": 0.58,
};

/** Ours for this page load, so a message we hear ourselves is recognisable. Never 1, which the e2e fixtures use for the peer. */
export function newSessionId(): number {
  return 2 + Math.floor(Math.random() * (MAX_SESSION - 1));
}

export interface PageLink {
  link: Link;
  sound: SoundTransport;
  qr: QrTransport;
  sampleRate: number;
}

/** Builds the worker and both transports. Call from a user gesture so iOS lets the audio context run. */
export async function openLink(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): Promise<PageLink> {
  const context = new AudioContext({ sampleRate: 48_000 });
  const worker = await CodecWorker.create(
    "./codec-worker.js",
    context.sampleRate,
  );
  const sound = new SoundTransport(context, worker, "./capture-worklet.js");
  const qr = new QrTransport(canvas, video, worker);
  return {
    link: new Link([sound, qr]),
    sound,
    qr,
    sampleRate: context.sampleRate,
  };
}
