import { aborted, abortError, type Transport } from "@/lib/transport.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import type { CodecWorker } from "./codecWorker.ts";
import { Speaker } from "./speaker.ts";
import { Microphone } from "./microphone.ts";

export interface SoundTransportOptions {
  protocol?: SoundProtocol;
  /** Silence between frames and between repeats of the sequence. */
  gapMs?: number;
  /** Passes through the frame sequence before `send` resolves on its own. */
  maxPasses?: number;
}

export class SoundTransport implements Transport {
  readonly id = "sound";
  #context: AudioContext;
  #worker: CodecWorker;
  #workletUrl: string;
  #microphone: Microphone | undefined;
  protocol: SoundProtocol;
  gapMs: number;
  /**
   * A device cannot hear the other one over its own speaker, so taking turns
   * means transmitting a bounded number of passes and then going quiet. Left at
   * Infinity, `send` loops until its signal aborts.
   */
  maxPasses: number;

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
    this.maxPasses = options.maxPasses ?? Infinity;
  }

  async send(frames: Uint8Array[], signal: AbortSignal): Promise<void> {
    await this.#context.resume();
    const speaker = new Speaker(this.#context);
    const clips = await Promise.all(
      frames.map((f) => this.#worker.encodeSound(f, this.protocol)),
    );
    try {
      for (let pass = 0; pass < this.maxPasses && !signal.aborted; pass++) {
        for (const clip of clips) {
          await speaker.play(clip, signal);
          await pause(this.gapMs, signal);
        }
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    }
  }

  /**
   * Opens the microphone and starts feeding the decoder, before anything is
   * transmitted. Idempotent. Taking turns means listening again the instant a
   * transmission ends, and `getUserMedia` is far too slow for that — so the
   * device is opened once and left rolling, and samples heard while we talk are
   * simply decoded to nobody. Must be called from a user gesture on iOS.
   */
  async listen(): Promise<void> {
    if (this.#microphone) return;
    await this.#context.resume();
    const microphone = await Microphone.open(this.#context, this.#workletUrl);
    microphone.onSamples((samples) => this.#worker.pushSound(samples));
    this.#microphone = microphone;
  }

  get listening(): boolean {
    return this.#microphone !== undefined;
  }

  stopListening(): void {
    this.#microphone?.close();
    this.#microphone = undefined;
  }

  async receive(
    onFrame: (frame: Uint8Array) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw abortError();
    const alreadyRolling = this.listening;
    await this.listen();
    const unsubscribe = this.#worker.onSoundFrames((frames) =>
      frames.forEach(onFrame)
    );
    try {
      await aborted(signal);
    } finally {
      unsubscribe();
      if (!alreadyRolling) this.stopListening();
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
