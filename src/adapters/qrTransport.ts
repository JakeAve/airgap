import { aborted, abortError, type Transport } from "@/lib/transport.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import type { CodecWorker } from "./codecWorker.ts";
import { showQrCodes } from "./screen.ts";
import { Camera, type Facing } from "./camera.ts";

type FrameListener = (frame: Uint8Array) => void;

export class QrTransport implements Transport {
  readonly id = "qr";
  #canvas: HTMLCanvasElement;
  #video: HTMLVideoElement;
  #worker: CodecWorker;
  #encoder = new QrEncoder();
  #camera: Camera | undefined;
  #watching: AbortController | undefined;
  facing: Facing = "environment";
  #listeners = new Set<FrameListener>();

  constructor(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    worker: CodecWorker,
  ) {
    this.#canvas = canvas;
    this.#video = video;
    this.#worker = worker;
  }

  send(frames: Uint8Array[], signal: AbortSignal): Promise<void> {
    return showQrCodes([this.#encoder.encode(frames)], this.#canvas, signal);
  }

  /**
   * Opens the camera and starts decoding, before anything is awaited.
   * Idempotent. Like the microphone, it is opened once and left rolling,
   * because `getUserMedia` is far too slow to run between legs of an
   * exchange. Must be called from a user gesture on iOS.
   */
  async watch(): Promise<void> {
    if (this.#camera) return;
    const camera = await Camera.open(this.#video, this.facing);
    const stop = new AbortController();
    this.#camera = camera;
    this.#watching = stop;
    camera.scan(async (image) => {
      const frames = await this.#worker.scanQr(image);
      for (const frame of frames) {
        for (const listener of this.#listeners) listener(frame);
      }
    }, stop.signal).catch(() => {});
  }

  /** Swaps front and rear. Reopening costs a `getUserMedia`, so do it between legs; listeners survive it. */
  async flip(): Promise<void> {
    this.facing = this.facing === "user" ? "environment" : "user";
    if (!this.watching) return;
    this.stopWatching();
    await this.watch();
  }

  get watching(): boolean {
    return this.#camera !== undefined;
  }

  stopWatching(): void {
    this.#watching?.abort();
    this.#camera?.close();
    this.#watching = undefined;
    this.#camera = undefined;
  }

  async receive(onFrame: FrameListener, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw abortError();
    const alreadyWatching = this.watching;
    await this.watch();
    this.#listeners.add(onFrame);
    try {
      await aborted(signal);
    } finally {
      this.#listeners.delete(onFrame);
      if (!alreadyWatching) this.stopWatching();
    }
  }
}
