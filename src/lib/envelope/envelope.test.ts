import { assertEquals, assertThrows } from "@std/assert";
import { decodeEnvelope, encodeEnvelope, EnvelopeError } from "./envelope.ts";
import {
  ENVELOPE_HEADER_BYTES,
  MAX_ENVELOPE_PAYLOAD_BYTES,
} from "@/lib/protocol.ts";

const sample = {
  type: 5,
  gameId: 42,
  sessionId: 3210,
  seq: 61,
  payload: new Uint8Array([0, 1, 127, 128, 255]),
};

Deno.test("envelope round trips and has a 5-byte header", () => {
  const bytes = encodeEnvelope(sample);
  assertEquals(bytes.length, ENVELOPE_HEADER_BYTES + sample.payload.length);
  assertEquals(decodeEnvelope(bytes), sample);
});

Deno.test("decoding ignores trailing padding", () => {
  const padded = new Uint8Array(32);
  padded.set(encodeEnvelope(sample));
  assertEquals(decodeEnvelope(padded), sample);
});

Deno.test("empty payload is allowed", () => {
  const env = { ...sample, payload: new Uint8Array() };
  assertEquals(decodeEnvelope(encodeEnvelope(env)), env);
});

Deno.test("largest payload round trips", () => {
  const env = {
    ...sample,
    payload: new Uint8Array(MAX_ENVELOPE_PAYLOAD_BYTES).fill(0xa5),
  };
  assertEquals(decodeEnvelope(encodeEnvelope(env)), env);
  assertThrows(
    () =>
      encodeEnvelope({
        ...env,
        payload: new Uint8Array(MAX_ENVELOPE_PAYLOAD_BYTES + 1),
      }),
    EnvelopeError,
  );
});

Deno.test("out-of-range fields are rejected", () => {
  assertThrows(() => encodeEnvelope({ ...sample, type: 8 }), EnvelopeError);
  assertThrows(() => encodeEnvelope({ ...sample, gameId: 64 }), EnvelopeError);
  assertThrows(
    () => encodeEnvelope({ ...sample, sessionId: 4096 }),
    EnvelopeError,
  );
  assertThrows(() => encodeEnvelope({ ...sample, seq: -1 }), EnvelopeError);
});

Deno.test("wrong version, short input, and truncated payload are rejected", () => {
  const bytes = encodeEnvelope(sample);
  const wrongVersion = bytes.slice();
  wrongVersion[0] ^= 0b0010_0000;
  assertThrows(() => decodeEnvelope(wrongVersion), EnvelopeError, "version");
  assertThrows(
    () => decodeEnvelope(bytes.slice(0, 3)),
    EnvelopeError,
    "header",
  );
  assertThrows(
    () => decodeEnvelope(bytes.slice(0, bytes.length - 1)),
    EnvelopeError,
    "declared",
  );
});
