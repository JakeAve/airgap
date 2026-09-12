import type {
  FromWorker,
  ToWorker,
} from "@/lib/transports/codecWorkerProtocol.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import type { RgbaImage } from "@/lib/transports/qr/qrDecoder.ts";

type FramesListener = (frames: Uint8Array[]) => void;

/** Page-side handle on the codec worker. */
export class CodecWorker {
  #worker: Worker;
  #nextId = 0;
  #encodes = new Map<number, (samples: Float32Array<ArrayBuffer>) => void>();
  #qrScans = new Map<number, (frames: Uint8Array[]) => void>();
  #soundListeners = new Set<FramesListener>();
  #ready: Promise<void>;

  private constructor(url: string, sampleRate: number) {
    this.#worker = new Worker(url, { type: "module" });
    this.#ready = new Promise((resolve, reject) => {
      this.#worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const m = event.data;
        switch (m.type) {
          case "ready":
            resolve();
            return;
          case "encoded":
            this.#encodes.get(m.id)?.(m.samples);
            this.#encodes.delete(m.id);
            return;
          case "soundFrames":
            for (const l of this.#soundListeners) l(m.frames);
            return;
          case "qrFrames":
            this.#qrScans.get(m.id)?.(m.frames);
            this.#qrScans.delete(m.id);
            return;
          case "error":
            console.error("codec worker:", m.message);
            reject(new Error(m.message));
            return;
        }
      };
      this.#worker.onerror = (event) => reject(new Error(event.message));
    });
    this.#send({ type: "init", sampleRate });
  }

  static async create(url: string, sampleRate: number): Promise<CodecWorker> {
    const w = new CodecWorker(url, sampleRate);
    await w.#ready;
    return w;
  }

  #send(message: ToWorker, transfer: Transferable[] = []) {
    this.#worker.postMessage(message, transfer);
  }

  encodeSound(
    frame: Uint8Array,
    protocol: SoundProtocol,
  ): Promise<Float32Array<ArrayBuffer>> {
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#encodes.set(id, resolve);
      this.#send({ type: "encodeSound", id, frame, protocol });
    });
  }

  /** Samples are transferred, so the caller must not reuse the buffer. */
  pushSound(samples: Float32Array<ArrayBuffer>): void {
    this.#send({ type: "sound", samples }, [samples.buffer]);
  }

  scanQr(image: RgbaImage): Promise<Uint8Array[]> {
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#qrScans.set(id, resolve);
      const transfer = image.data.buffer instanceof ArrayBuffer
        ? [image.data.buffer]
        : [];
      this.#send({ type: "qr", id, ...image }, transfer);
    });
  }

  onSoundFrames(listener: FramesListener): () => void {
    this.#soundListeners.add(listener);
    return () => this.#soundListeners.delete(listener);
  }

  terminate(): void {
    this.#worker.terminate();
  }
}
