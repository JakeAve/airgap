import { assert, assertEquals } from "@std/assert";
import {
  ENVELOPE_HEADER_BYTES,
  FRAME_BYTES,
  FRAME_PAYLOAD_BYTES,
  GGWAVE_MAX_FIXED_PAYLOAD_BYTES,
  MAX_ENVELOPE_PAYLOAD_BYTES,
  QR_MAX_FRAMES_PER_CODE,
} from "./protocol.ts";

Deno.test("a frame fits a ggwave fixed-length payload", () => {
  assert(FRAME_BYTES > 0);
  assert(FRAME_BYTES <= GGWAVE_MAX_FIXED_PAYLOAD_BYTES);
});

Deno.test("an 8-byte order plus envelope header fits one frame", () => {
  assert(ENVELOPE_HEADER_BYTES + 8 <= FRAME_PAYLOAD_BYTES);
});

Deno.test("qr codes stay under the reliable scanning size", () => {
  assert(QR_MAX_FRAMES_PER_CODE * FRAME_BYTES <= 512);
});

Deno.test("envelope payload limit is derived from the frame limit", () => {
  assertEquals(MAX_ENVELOPE_PAYLOAD_BYTES, 64 * 13 - 5);
});
