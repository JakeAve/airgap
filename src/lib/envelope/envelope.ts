// The message header every game payload travels inside. Fixed at 40 bits:
// version 3 | type 3 | gameId 6 | sessionId 12 | seq 6 | length 10.
import { BitReader, BitWriter } from "@/lib/bits/mod.ts";
import {
  ENVELOPE_HEADER_BYTES,
  MAX_ENVELOPE_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
} from "@/lib/protocol.ts";

export interface Envelope {
  /** Per-game message kind, 0..7. */
  type: number;
  /** 0..63 */
  gameId: number;
  /** Agreed at pairing, 0..4095. */
  sessionId: number;
  /** Increments per message and wraps, 0..63. Lets receivers drop repeats. */
  seq: number;
  payload: Uint8Array;
}

export const ENVELOPE_LIMITS = {
  type: 7,
  gameId: 63,
  sessionId: 4095,
  seq: 63,
} as const;

export class EnvelopeError extends Error {
  override readonly name = "EnvelopeError";
}

function assertField(name: keyof typeof ENVELOPE_LIMITS, value: number) {
  const max = ENVELOPE_LIMITS[name];
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new EnvelopeError(
      `${name} must be an integer in 0..${max}, got ${value}`,
    );
  }
}

export function encodeEnvelope(envelope: Envelope): Uint8Array {
  assertField("type", envelope.type);
  assertField("gameId", envelope.gameId);
  assertField("sessionId", envelope.sessionId);
  assertField("seq", envelope.seq);
  if (envelope.payload.length > MAX_ENVELOPE_PAYLOAD_BYTES) {
    throw new EnvelopeError(
      `payload of ${envelope.payload.length} bytes exceeds ${MAX_ENVELOPE_PAYLOAD_BYTES}`,
    );
  }
  return new BitWriter()
    .write(PROTOCOL_VERSION, 3)
    .write(envelope.type, 3)
    .write(envelope.gameId, 6)
    .write(envelope.sessionId, 12)
    .write(envelope.seq, 6)
    .write(envelope.payload.length, 10)
    .writeBytes(envelope.payload)
    .bytes();
}

/**
 * Decodes an envelope from the front of `bytes`. Trailing bytes beyond the
 * declared payload length are ignored, which is how frame padding is dropped.
 */
export function decodeEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < ENVELOPE_HEADER_BYTES) {
    throw new EnvelopeError(
      `need ${ENVELOPE_HEADER_BYTES} header bytes, got ${bytes.length}`,
    );
  }
  const reader = new BitReader(bytes);
  const version = reader.read(3);
  if (version !== PROTOCOL_VERSION) {
    throw new EnvelopeError(
      `protocol version ${version}, expected ${PROTOCOL_VERSION}`,
    );
  }
  const type = reader.read(3);
  const gameId = reader.read(6);
  const sessionId = reader.read(12);
  const seq = reader.read(6);
  const length = reader.read(10);
  const available = bytes.length - ENVELOPE_HEADER_BYTES;
  if (length > available) {
    throw new EnvelopeError(
      `declared payload of ${length} bytes but only ${available} present`,
    );
  }
  const payload = bytes.slice(
    ENVELOPE_HEADER_BYTES,
    ENVELOPE_HEADER_BYTES + length,
  );
  return { type, gameId, sessionId, seq, payload };
}
