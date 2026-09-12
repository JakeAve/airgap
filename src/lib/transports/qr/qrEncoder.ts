import encodeQR, { type ErrorCorrection } from "qr";
import { FRAME_BYTES, MAX_FRAMES_PER_MESSAGE } from "@/lib/protocol.ts";
import { bytesToText, textToBytes } from "./bytesAsText.ts";

/** Module grid, `matrix[y][x]` true for a dark module. No quiet zone. */
export type QrMatrix = boolean[][];

export interface QrEncoderOptions {
  ecc?: ErrorCorrection;
}

export class QrEncoder {
  #ecc: ErrorCorrection;

  constructor(options: QrEncoderOptions = {}) {
    this.#ecc = options.ecc ?? "medium";
  }

  /** Packs a whole message's frames into one code. */
  encode(frames: Uint8Array[]): QrMatrix {
    if (frames.length === 0 || frames.length > MAX_FRAMES_PER_MESSAGE) {
      throw new RangeError(
        `expected 1..${MAX_FRAMES_PER_MESSAGE} frames, got ${frames.length}`,
      );
    }
    const bytes = new Uint8Array(frames.length * FRAME_BYTES);
    frames.forEach((frame, i) => {
      if (frame.length !== FRAME_BYTES) {
        throw new RangeError(
          `frame ${i} must be ${FRAME_BYTES} bytes, got ${frame.length}`,
        );
      }
      bytes.set(frame, i * FRAME_BYTES);
    });
    return encodeQR(bytesToText(bytes), "raw", {
      ecc: this.#ecc,
      encoding: "byte",
      textEncoder: textToBytes,
    });
  }
}
