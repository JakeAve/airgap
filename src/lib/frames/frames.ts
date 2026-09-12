// Splits a message into fixed-size frames and puts them back together.
// Frame layout: type 2 | seq 2 | session 8 | index 2 | total-1 2 | payload 16 | crc8.
// Every frame names its leg, so a receiver can filter frames before
// reassembling them, and frames are identical whichever transport carries them.
import { BitReader, BitWriter, crc8 } from "@/lib/bits/mod.ts";
import {
  FRAME_BYTES,
  FRAME_PAYLOAD_BYTES,
  INDEX_BITS,
  MAX_FRAMES_PER_MESSAGE,
  MAX_PAYLOAD_BYTES,
  MAX_SEQ,
  MAX_SESSION,
  MAX_TYPE,
  SEQ_BITS,
  SESSION_BITS,
  TYPE_BITS,
} from "@/lib/protocol.ts";

/** Which leg of which round of which pairing a message belongs to. */
export interface Leg {
  /** Per-game message kind, 0..3. */
  type: number;
  /** Round counter, wraps at 4. Enough to tell this round from the last. */
  seq: number;
  /** Agreed at pairing, 0..255. */
  session: number;
}

export interface Message extends Leg {
  /**
   * Up to MAX_PAYLOAD_BYTES. A received payload is padded with zero bytes to a
   * whole number of frames; the game's codec knows where its data ends.
   */
  payload: Uint8Array;
}

export interface Frame extends Leg {
  index: number;
  total: number;
  payload: Uint8Array;
}

export class FrameError extends Error {
  override readonly name = "FrameError";
}

function assertField(name: string, value: number, max: number) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new FrameError(
      `${name} must be an integer in 0..${max}, got ${value}`,
    );
  }
}

export function sameLeg(a: Leg, b: Leg): boolean {
  return a.type === b.type && a.seq === b.seq && a.session === b.session;
}

export function buildFrames(message: Message): Uint8Array[] {
  if (message.payload.length > MAX_PAYLOAD_BYTES) {
    throw new FrameError(
      `payload of ${message.payload.length} bytes exceeds ${MAX_PAYLOAD_BYTES}`,
    );
  }
  const total = Math.max(
    1,
    Math.ceil(message.payload.length / FRAME_PAYLOAD_BYTES),
  );
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index++) {
    const payload = new Uint8Array(FRAME_PAYLOAD_BYTES);
    payload.set(
      message.payload.subarray(
        index * FRAME_PAYLOAD_BYTES,
        (index + 1) * FRAME_PAYLOAD_BYTES,
      ),
    );
    frames.push(encodeFrame({ ...message, index, total, payload }));
  }
  return frames;
}

export function encodeFrame(frame: Frame): Uint8Array {
  assertField("type", frame.type, MAX_TYPE);
  assertField("seq", frame.seq, MAX_SEQ);
  assertField("session", frame.session, MAX_SESSION);
  assertField("total", frame.total - 1, MAX_FRAMES_PER_MESSAGE - 1);
  assertField("index", frame.index, frame.total - 1);
  if (frame.payload.length !== FRAME_PAYLOAD_BYTES) {
    throw new FrameError(
      `payload must be ${FRAME_PAYLOAD_BYTES} bytes, got ${frame.payload.length}`,
    );
  }
  const body = new BitWriter()
    .write(frame.type, TYPE_BITS)
    .write(frame.seq, SEQ_BITS)
    .write(frame.session, SESSION_BITS)
    .write(frame.index, INDEX_BITS)
    .write(frame.total - 1, INDEX_BITS)
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
  const type = reader.read(TYPE_BITS);
  const seq = reader.read(SEQ_BITS);
  const session = reader.read(SESSION_BITS);
  const index = reader.read(INDEX_BITS);
  const total = reader.read(INDEX_BITS) + 1;
  if (index >= total) return null;
  return {
    type,
    seq,
    session,
    index,
    total,
    payload: reader.readBytes(FRAME_PAYLOAD_BYTES),
  };
}

export interface ReassemblyProgress {
  /** False when the frame was rejected or repeated one already held. */
  accepted: boolean;
  received: number;
  total: number;
  /** Present once every frame of the current message has arrived. */
  message?: Message;
}

/**
 * Collects frames for one leg at a time. A frame from a different leg or with
 * a different total discards any partial message and starts over. Retries of
 * the same leg share a key, so frames caught across retries add up.
 */
export class Reassembler {
  #leg: Leg | null = null;
  #total = 0;
  #parts: (Uint8Array | null)[] = [];
  #received = 0;

  get progress(): ReassemblyProgress {
    return { accepted: false, received: this.#received, total: this.#total };
  }

  reset(): void {
    this.#leg = null;
    this.#total = 0;
    this.#parts = [];
    this.#received = 0;
  }

  /** `accept` sees every valid frame's leg; rejected frames leave the partial message alone. */
  push(bytes: Uint8Array, accept?: (leg: Leg) => boolean): ReassemblyProgress {
    const frame = parseFrame(bytes);
    if (!frame || accept?.(frame) === false) return this.progress;

    if (
      !this.#leg || !sameLeg(frame, this.#leg) || frame.total !== this.#total
    ) {
      this.#leg = { type: frame.type, seq: frame.seq, session: frame.session };
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
      received: this.#received,
      total: this.#total,
      message: done ? { ...this.#leg, payload: this.#assemble() } : undefined,
    };
  }

  #assemble(): Uint8Array {
    const out = new Uint8Array(this.#total * FRAME_PAYLOAD_BYTES);
    this.#parts.forEach((part, i) => out.set(part!, i * FRAME_PAYLOAD_BYTES));
    return out;
  }
}
