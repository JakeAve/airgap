import { assert } from "@std/assert";
import {
  QR_FRAME_MAX_BYTES,
  SOUND_FRAME_BYTES,
  SOUND_FRAME_MAX_BYTES,
} from "./protocol.ts";

Deno.test("sound frame fits a ggwave fixed-length payload", () => {
  assert(SOUND_FRAME_BYTES > 0);
  assert(SOUND_FRAME_BYTES <= SOUND_FRAME_MAX_BYTES);
});

Deno.test("qr frames are at least as large as sound frames", () => {
  assert(QR_FRAME_MAX_BYTES >= SOUND_FRAME_BYTES);
});
