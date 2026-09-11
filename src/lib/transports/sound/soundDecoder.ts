import { SOUND_SAMPLES_PER_BLOCK } from "@/lib/protocol.ts";
import {
  frameParameters,
  type GgwaveInstance,
  type GgwaveModule,
  loadGgwave,
} from "./ggwave.ts";

/**
 * ggwave keeps reporting a completed frame for the next few blocks while it is
 * still inside the analysis window. A frame lasts at least 24 blocks, so an
 * identical frame this soon is the same transmission, not a repeat.
 */
const DUPLICATE_WINDOW_BLOCKS = 8;

/**
 * Feeds 48 kHz mono samples to ggwave and yields decoded frames. ggwave only
 * consumes whole blocks of SOUND_SAMPLES_PER_BLOCK samples and silently drops
 * anything shorter, so pushes of any size are buffered into blocks here.
 */
export class SoundDecoder {
  #g: GgwaveModule;
  #instance: GgwaveInstance;
  #block = new Float32Array(SOUND_SAMPLES_PER_BLOCK);
  #filled = 0;
  #blockCount = 0;
  #lastFrame: Uint8Array | null = null;
  #lastFrameBlock = 0;

  private constructor(g: GgwaveModule) {
    this.#g = g;
    this.#instance = g.init(frameParameters(g));
    const ids = g.ProtocolId;
    for (
      const id of [
        ids.GGWAVE_PROTOCOL_ULTRASOUND_NORMAL,
        ids.GGWAVE_PROTOCOL_ULTRASOUND_FAST,
        ids.GGWAVE_PROTOCOL_ULTRASOUND_FASTEST,
        ids.GGWAVE_PROTOCOL_DT_NORMAL,
        ids.GGWAVE_PROTOCOL_DT_FAST,
        ids.GGWAVE_PROTOCOL_DT_FASTEST,
      ]
    ) {
      g.rxToggleProtocol(id, 0);
    }
  }

  static async create(): Promise<SoundDecoder> {
    return new SoundDecoder(await loadGgwave());
  }

  push(samples: Float32Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(
        SOUND_SAMPLES_PER_BLOCK - this.#filled,
        samples.length - offset,
      );
      this.#block.set(samples.subarray(offset, offset + take), this.#filled);
      this.#filled += take;
      offset += take;
      if (this.#filled === SOUND_SAMPLES_PER_BLOCK) {
        this.#filled = 0;
        this.#blockCount++;
        const frame = this.#decodeBlock();
        if (frame && !this.#isEcho(frame)) {
          frames.push(frame);
          this.#lastFrame = frame;
          this.#lastFrameBlock = this.#blockCount;
        }
      }
    }
    return frames;
  }

  #isEcho(frame: Uint8Array): boolean {
    return this.#lastFrame !== null &&
      this.#blockCount - this.#lastFrameBlock <= DUPLICATE_WINDOW_BLOCKS &&
      this.#lastFrame.every((b, i) => b === frame[i]);
  }

  #decodeBlock(): Uint8Array | null {
    const bytes = new Uint8Array(
      this.#block.buffer,
      this.#block.byteOffset,
      this.#block.byteLength,
    );
    const result = this.#g.decode(this.#instance, bytes);
    return result.length > 0 ? new Uint8Array(result) : null;
  }

  dispose(): void {
    this.#g.free(this.#instance);
  }
}
