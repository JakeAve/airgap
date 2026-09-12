import { assert, assertEquals } from "@std/assert";
import {
  FRAME_BITS,
  FRAME_BYTES,
  FRAME_CRC_BYTES,
  FRAME_PAYLOAD_BYTES,
  GGWAVE_MAX_FIXED_PAYLOAD_BYTES,
  INDEX_BITS,
  MAX_FRAMES_PER_MESSAGE,
  MAX_PAYLOAD_BYTES,
  SEQ_BITS,
  SESSION_BITS,
  TYPE_BITS,
} from "./protocol.ts";

Deno.test("a frame fits a ggwave fixed-length payload", () => {
  assert(FRAME_BYTES > 0);
  assert(FRAME_BYTES <= GGWAVE_MAX_FIXED_PAYLOAD_BYTES);
});

Deno.test("the frame layout fills the frame exactly", () => {
  const header = TYPE_BITS + SEQ_BITS + SESSION_BITS + INDEX_BITS * 2;
  assertEquals(
    header + FRAME_PAYLOAD_BYTES * 8 + FRAME_CRC_BYTES * 8,
    FRAME_BITS,
  );
});

Deno.test("a whole message fits one qr code at close range", () => {
  assert(MAX_FRAMES_PER_MESSAGE * FRAME_BYTES <= 512);
});

Deno.test("round zero fits: gameId 6, seed 16, and a 7-bit move", () => {
  assert(Math.ceil((6 + 16 + 7) / 8) <= MAX_PAYLOAD_BYTES);
});
