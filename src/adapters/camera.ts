import type { RgbaImage } from "@/lib/transports/qr/qrDecoder.ts";

const MAX_SCAN_EDGE = 640;

/** `environment` is the rear camera, `user` the front one. */
export type Facing = "environment" | "user";

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

export class Camera {
  #stream: MediaStream;
  #video: HTMLVideoElement;
  #canvas = document.createElement("canvas");

  private constructor(stream: MediaStream, video: HTMLVideoElement) {
    this.#stream = stream;
    this.#video = video;
  }

  /**
   * Opens a camera into `video`. A front camera is previewed mirrored, the
   * way people expect to see themselves; the decoder gets the raw frames.
   * Must be called from a user gesture on iOS.
   */
  static async open(
    video: HTMLVideoElement,
    facing: Facing = "environment",
  ): Promise<Camera> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.classList.toggle("mirrored", facing === "user");
    await video.play();
    return new Camera(stream, video);
  }

  /**
   * Calls `onImage` with a downscaled RGBA copy of each new video frame,
   * waiting for the previous call to finish so decoding never backs up.
   */
  async scan(
    onImage: (image: RgbaImage) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      await this.#nextFrame();
      if (signal.aborted) break;
      const image = this.#grab();
      if (image) await onImage(image);
    }
  }

  #nextFrame(): Promise<void> {
    const video = this.#video as VideoWithFrameCallback;
    return new Promise((resolve) => {
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(() => resolve());
      } else requestAnimationFrame(() => resolve());
    });
  }

  #grab(): RgbaImage | null {
    const { videoWidth, videoHeight } = this.#video;
    if (!videoWidth || !videoHeight) return null;
    const scale = Math.min(
      1,
      MAX_SCAN_EDGE / Math.max(videoWidth, videoHeight),
    );
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    this.#canvas.width = width;
    this.#canvas.height = height;
    const ctx = this.#canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(this.#video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { width, height, data };
  }

  close(): void {
    for (const track of this.#stream.getTracks()) track.stop();
    this.#video.srcObject = null;
  }
}
