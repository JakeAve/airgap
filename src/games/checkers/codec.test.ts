import { assertEquals, assertThrows } from "@std/assert";
import { decodeMove, encodeMove } from "./codec.ts";
import { BitWriter } from "@/lib/bits/mod.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";

const leg = { type: 0, seq: 0, session: 1 };

Deno.test("a one-hop step encodes to 2 bytes", () => {
  const payload = encodeMove([0, 4]);
  assertEquals(payload.length, 2);
  assertEquals(decodeMove(payload), [0, 4]);
});

Deno.test("a three-jump path survives framing padding", () => {
  const path = [0, 9, 18, 27];
  const frames = buildFrames({ ...leg, payload: encodeMove(path) });
  const r = new Reassembler();
  let last;
  for (const f of frames) last = r.push(f);
  assertEquals(decodeMove(last!.message!.payload), path);
});

Deno.test("decodeMove rejects an empty payload, a zero count, and a direction off the board", () => {
  assertEquals(decodeMove(new Uint8Array([])), null);
  assertEquals(decodeMove(new Uint8Array([0])), null);

  const offBoard = new BitWriter()
    .write(1, 4) // hop count
    .write(0, 1) // jump
    .write(0, 5) // from square 0 (top-left corner)
    .write(0, 2) // dir 0 = up-left, leaves the board
    .bytes();
  assertEquals(decodeMove(offBoard), null);
});

Deno.test("encodeMove throws on a path that mixes a step and a jump", () => {
  assertThrows(() => encodeMove([0, 4, 13]), RangeError);
});
