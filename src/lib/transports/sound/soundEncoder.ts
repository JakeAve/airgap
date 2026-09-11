import { FRAME_BYTES } from "@/lib/protocol.ts";
import {
  frameParameters,
  type GgwaveInstance,
  type GgwaveModule,
  loadGgwave,
  protocolId,
  type SoundProtocol,
} from "./ggwave.ts";

export interface SoundEncoderOptions {
  protocol?: SoundProtocol;
  /** ggwave volume, 0..100. */
  volume?: number;
  /** Rate the returned samples are meant to be played at. */
  sampleRate?: number;
}

/** Turns one frame into 48 kHz mono float samples. Pure; playback lives in the speaker adapter. */
export class SoundEncoder {
  #g: GgwaveModule;
  #instance: GgwaveInstance;
  #protocol: SoundProtocol;
  #volume: number;

  private constructor(g: GgwaveModule, options: SoundEncoderOptions) {
    this.#g = g;
    this.#instance = g.init(frameParameters(g, options.sampleRate));
    this.#protocol = options.protocol ?? "fastest";
    this.#volume = options.volume ?? 50;
  }

  static async create(
    options: SoundEncoderOptions = {},
  ): Promise<SoundEncoder> {
    return new SoundEncoder(await loadGgwave(), options);
  }

  get protocol(): SoundProtocol {
    return this.#protocol;
  }

  set protocol(value: SoundProtocol) {
    this.#protocol = value;
  }

  encode(frame: Uint8Array): Float32Array<ArrayBuffer> {
    if (frame.length !== FRAME_BYTES) {
      throw new RangeError(
        `frame must be ${FRAME_BYTES} bytes, got ${frame.length}`,
      );
    }
    const raw = this.#g.encode(
      this.#instance,
      frame,
      protocolId(this.#g, this.#protocol),
      this.#volume,
    );
    const samples = new Float32Array(
      raw.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    samples.set(new Float32Array(raw.buffer, raw.byteOffset, samples.length));
    return samples;
  }

  dispose(): void {
    this.#g.free(this.#instance);
  }
}
