import { aborted, abortError, type Transport } from "@/lib/transport.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import type { CodecWorker } from "./codecWorker.ts";
import { Speaker } from "./speaker.ts";
import { Microphone } from "./microphone.ts";

export interface SoundTransportOptions {
  protocol?: SoundProtocol;
  /** Silence between frames and between repeats of the sequence. */
  gapMs?: number;
}

export class SoundTransport implements Transport {
  readonly id = "sound";
  #context: AudioContext;
  #worker: CodecWorker;
  #workletUrl: string;
  protocol: SoundProtocol;
  gapMs: number;

  constructor(
    context: AudioContext,
    worker: CodecWorker,
    workletUrl: string,
    options: SoundTransportOptions = {},
  ) {
    this.#context = context;
    this.#worker = worker;
    this.#workletUrl = workletUrl;
    this.protocol = options.protocol ?? "fastest";
    this.gapMs = options.gapMs ?? 150;
  }

  async send(frames: Uint8Array[], signal: AbortSignal): Promise<void> {
    await this.#context.resume();
    const speaker = new Speaker(this.#context);
    const clips = await Promise.all(
      frames.map((f) => this.#worker.encodeSound(f, this.protocol)),
    );
    try {
      while (!signal.aborted) {
        for (const clip of clips) {
          await speaker.play(clip, signal);
          await pause(this.gapMs, signal);
        }
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    }
  }

  async receive(
    onFrame: (frame: Uint8Array) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw abortError();
    await this.#context.resume();
    const microphone = await Microphone.open(this.#context, this.#workletUrl);
    const unsubscribe = this.#worker.onSoundFrames((frames) =>
      frames.forEach(onFrame)
    );
    microphone.onSamples((samples) => this.#worker.pushSound(samples));
    try {
      await aborted(signal);
    } finally {
      unsubscribe();
      microphone.close();
    }
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}
