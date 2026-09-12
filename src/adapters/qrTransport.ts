import { abortError, type Transport } from "@/lib/transport.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import type { CodecWorker } from "./codecWorker.ts";
import { showQrCodes } from "./screen.ts";
import { Camera } from "./camera.ts";

export class QrTransport implements Transport {
  readonly id = "qr";
  #canvas: HTMLCanvasElement;
  #video: HTMLVideoElement;
  #worker: CodecWorker;
  #encoder = new QrEncoder();

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

  async receive(
    onFrame: (frame: Uint8Array) => void,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw abortError();
    const camera = await Camera.open(this.#video);
    try {
      await camera.scan(async (image) => {
        const frames = await this.#worker.scanQr(image);
        frames.forEach(onFrame);
      }, signal);
    } finally {
      camera.close();
    }
  }
}
