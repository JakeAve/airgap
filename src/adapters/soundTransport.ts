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
  /** Wait after closing the microphone for iOS to leave its call audio mode before an ultrasound pass. */
  micSettleMs?: number;
}

export class SoundTransport implements Transport {
  readonly id = "sound";
  #context: AudioContext;
  #worker: CodecWorker;
  #workletUrl: string;
  #microphone: Microphone | undefined;
  #wantsMicrophone = false;
  #ultrasoundSends = 0;
  protocol: SoundProtocol;
  gapMs: number;
  /**
   * A device cannot hear the other one over its own speaker, so taking turns
   * means transmitting a bounded number of passes and then going quiet. Left at
   * Infinity, `send` loops until its signal aborts.
   */
  maxPasses: number;
  micSettleMs: number;
  /** Receives audio route diagnostics, for pages with a log. */
  log: (line: string) => void = () => {};

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
    this.micSettleMs = options.micSettleMs ?? 0;
  }

  async send(frames: Uint8Array[], signal: AbortSignal): Promise<void> {
    await this.#context.resume();
    const speaker = new Speaker(this.#context);
    const clips = await Promise.all(
      frames.map((f) => this.#worker.encodeSound(f, this.protocol)),
    );
    const ultrasound = this.protocol.startsWith("ultrasound");
    try {
      if (ultrasound) await this.#quietMicrophone(signal);
      for (let pass = 0; pass < this.maxPasses && !signal.aborted; pass++) {
        for (const clip of clips) {
          await speaker.play(clip, signal);
          await pause(this.gapMs, signal);
        }
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    } finally {
      if (ultrasound) this.#restoreMicrophone();
    }
  }

  /**
   * An open microphone holds iOS Safari in its video-call audio mode, and
   * nothing a page sets gets playback out of it, so ultrasound only reaches the
   * speaker with the microphone closed. Reopening within a minute does not
   * re-prompt, and a turn game is not listening for its own move anyway.
   */
  async #quietMicrophone(signal: AbortSignal): Promise<void> {
    this.#ultrasoundSends++;
    if (!this.#microphone) return;
    this.#closeMicrophone();
    setAudioSessionType("playback");
    await pause(this.micSettleMs, signal);
    // The output unit keeps the call mode it started under until it restarts.
    await this.#context.suspend();
    await this.#context.resume();
    this.log(
      `mic closed for ultrasound, context ${this.#context.state}: ${audioRoute()}`,
    );
  }

  #restoreMicrophone(): void {
    if (--this.#ultrasoundSends > 0) return;
    setAudioSessionType("auto");
    if (this.#wantsMicrophone) {
      this.#openMicrophone().catch((err) =>
        this.log(`microphone reopen failed: ${err}`)
      );
    }
  }

  async #openMicrophone(): Promise<void> {
    await this.#context.resume();
    const microphone = await Microphone.open(this.#context, this.#workletUrl);
    if (
      !this.#wantsMicrophone || this.#ultrasoundSends > 0 || this.#microphone
    ) {
      microphone.close();
      return;
    }
    microphone.onSamples((samples) => this.#worker.pushSound(samples));
    this.#microphone = microphone;
    const { sampleRate, echoCancellation } = microphone.settings;
    this.log(
      `mic open at ${sampleRate} Hz, echoCancellation ${echoCancellation}: ${audioRoute()}`,
    );
  }

  #closeMicrophone(): void {
    this.#microphone?.close();
    this.#microphone = undefined;
  }

  /**
   * Opens the microphone and starts feeding the decoder, before anything is
   * transmitted. Idempotent. Taking turns means listening again the instant a
   * transmission ends, and `getUserMedia` is far too slow for that — so the
   * device is opened once and left rolling, and samples heard while we talk are
   * simply decoded to nobody. Must be called from a user gesture on iOS.
   */
  async listen(): Promise<void> {
    this.#wantsMicrophone = true;
    if (this.#microphone || this.#ultrasoundSends > 0) return;
    try {
      await this.#openMicrophone();
    } catch (err) {
      this.#wantsMicrophone = false;
      throw err;
    }
  }

  get listening(): boolean {
    return this.#wantsMicrophone;
  }

  stopListening(): void {
    this.#wantsMicrophone = false;
    this.#closeMicrophone();
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

/** A fresh AudioContext takes the hardware rate, which call audio modes can lower. */
function audioRoute(): string {
  const probe = new AudioContext();
  const rate = probe.sampleRate;
  probe.close();
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  return `hardware ${rate} Hz, audioSession ${session?.type ?? "unsupported"}`;
}

function setAudioSessionType(type: "auto" | "playback"): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (session) session.type = type;
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
