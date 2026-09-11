// Splits a message into fixed-size frames and puts them back together.
// Frame layout: header (msgId 4 | index 6 | total 6) | payload | crc8.
// Frames are identical whichever transport carries them, so a reassembler can
// accept a mix of sound and QR frames for the same message.
import { BitReader, BitWriter, crc8 } from "@/lib/bits/mod.ts";
import {
  FRAME_BYTES,
  FRAME_HEADER_BYTES,
  FRAME_PAYLOAD_BYTES,
  MAX_FRAMES_PER_MESSAGE,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGE_ID,
} from "@/lib/protocol.ts";

export interface FrameHeader {
  msgId: number;
  index: number;
  total: number;
}

export interface Frame extends FrameHeader {
  payload: Uint8Array;
}

export class FrameError extends Error {
  override readonly name = "FrameError";
}

export function buildFrames(message: Uint8Array, msgId: number): Uint8Array[] {
  if (!Number.isInteger(msgId) || msgId < 0 || msgId > MAX_MESSAGE_ID) {
    throw new FrameError(
      `msgId must be an integer in 0..${MAX_MESSAGE_ID}, got ${msgId}`,
    );
  }
  if (message.length === 0) throw new FrameError("message is empty");
  if (message.length > MAX_MESSAGE_BYTES) {
    throw new FrameError(
      `message of ${message.length} bytes exceeds ${MAX_MESSAGE_BYTES}`,
    );
  }
  const total = Math.ceil(message.length / FRAME_PAYLOAD_BYTES);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index++) {
    const payload = new Uint8Array(FRAME_PAYLOAD_BYTES);
    payload.set(
      message.subarray(
        index * FRAME_PAYLOAD_BYTES,
        (index + 1) * FRAME_PAYLOAD_BYTES,
      ),
    );
    frames.push(encodeFrame({ msgId, index, total, payload }));
  }
  return frames;
}

export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.payload.length !== FRAME_PAYLOAD_BYTES) {
    throw new FrameError(
      `payload must be ${FRAME_PAYLOAD_BYTES} bytes, got ${frame.payload.length}`,
    );
  }
  const body = new BitWriter()
    .write(frame.msgId, 4)
    .write(frame.index, 6)
    .write(frame.total - 1, 6)
    .writeBytes(frame.payload)
    .bytes();
  const out = new Uint8Array(FRAME_BYTES);
  out.set(body);
  out[FRAME_BYTES - 1] = crc8(body);
  return out;
}

/** Returns null for anything that is not a well-formed frame with a valid CRC. */
export function parseFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length !== FRAME_BYTES) return null;
  const body = bytes.subarray(0, FRAME_BYTES - 1);
  if (crc8(body) !== bytes[FRAME_BYTES - 1]) return null;
  const reader = new BitReader(body);
  const msgId = reader.read(4);
  const index = reader.read(6);
  const total = reader.read(6) + 1;
  if (index >= total) return null;
  return {
    msgId,
    index,
    total,
    payload: body.slice(
      FRAME_HEADER_BYTES,
      FRAME_HEADER_BYTES + FRAME_PAYLOAD_BYTES,
    ),
  };
}

export interface ReassemblyProgress {
  /** False when the bytes were not a valid frame or repeated one already held. */
  accepted: boolean;
  msgId: number | null;
  received: number;
  total: number;
  /** Present once every frame of the current message has arrived. */
  message?: Uint8Array;
}

/**
 * Collects frames for one message at a time. A frame with a different msgId
 * discards any partial message and starts over, since the sender has moved on.
 */
export class Reassembler {
  #msgId: number | null = null;
  #total = 0;
  #parts: (Uint8Array | null)[] = [];
  #received = 0;

  get progress(): ReassemblyProgress {
    return {
      accepted: false,
      msgId: this.#msgId,
      received: this.#received,
      total: this.#total,
    };
  }

  reset(): void {
    this.#msgId = null;
    this.#total = 0;
    this.#parts = [];
    this.#received = 0;
  }

  push(bytes: Uint8Array): ReassemblyProgress {
    const frame = parseFrame(bytes);
    if (!frame) return this.progress;

    if (frame.msgId !== this.#msgId || frame.total !== this.#total) {
      this.#msgId = frame.msgId;
      this.#total = frame.total;
      this.#parts = new Array(frame.total).fill(null);
      this.#received = 0;
    }
    if (this.#parts[frame.index]) return this.progress;

    this.#parts[frame.index] = frame.payload;
    this.#received++;
    const done = this.#received === this.#total;
    return {
      accepted: true,
      msgId: this.#msgId,
      received: this.#received,
      total: this.#total,
      message: done ? this.#assemble() : undefined,
    };
  }

  #assemble(): Uint8Array {
    const out = new Uint8Array(this.#total * FRAME_PAYLOAD_BYTES);
    this.#parts.forEach((part, i) => out.set(part!, i * FRAME_PAYLOAD_BYTES));
    return out;
  }
}

export { MAX_FRAMES_PER_MESSAGE };
