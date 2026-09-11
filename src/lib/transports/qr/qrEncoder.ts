import encodeQR, { type ErrorCorrection } from "qr";
import { FRAME_BYTES, QR_MAX_FRAMES_PER_CODE } from "@/lib/protocol.ts";
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

  /** Packs up to QR_MAX_FRAMES_PER_CODE frames into one code. */
  encode(frames: Uint8Array[]): QrMatrix {
    if (frames.length === 0 || frames.length > QR_MAX_FRAMES_PER_CODE) {
      throw new RangeError(
        `expected 1..${QR_MAX_FRAMES_PER_CODE} frames, got ${frames.length}`,
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

/** Splits a message's frames into as many codes as needed. */
export function chunkFramesForQr(frames: Uint8Array[]): Uint8Array[][] {
  const codes: Uint8Array[][] = [];
  for (let i = 0; i < frames.length; i += QR_MAX_FRAMES_PER_CODE) {
    codes.push(frames.slice(i, i + QR_MAX_FRAMES_PER_CODE));
  }
  return codes;
}
