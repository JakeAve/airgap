import decodeQR from "qr/decode.js";
import { FRAME_BYTES } from "@/lib/protocol.ts";
import { bytesToText, textToBytes } from "./bytesAsText.ts";

/** RGBA pixels, the same shape as a DOM ImageData. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class QrDecoder {
  /** Returns the frames found in the image, or an empty array when no code of ours is visible. */
  push(image: RgbaImage): Uint8Array[] {
    let text: string;
    try {
      text = decodeQR(image, { textDecoder: bytesToText });
    } catch {
      return [];
    }
    const bytes = textToBytes(text);
    if (bytes.length === 0 || bytes.length % FRAME_BYTES !== 0) return [];
    const frames: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += FRAME_BYTES) {
      frames.push(bytes.slice(i, i + FRAME_BYTES));
    }
    return frames;
  }
}
