import { assertEquals } from "@std/assert";
import { decodeMove, encodeMove } from "./codec.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";

const leg = { type: 0, seq: 0, session: 1 };

Deno.test("a move survives framing padding", () => {
  for (let cell = 0; cell <= 8; cell++) {
    const frames = buildFrames({ ...leg, payload: encodeMove(cell) });
    const r = new Reassembler();
    let last;
    for (const f of frames) last = r.push(f);
    assertEquals(decodeMove(last!.message!.payload), cell);
  }
});

Deno.test("decodeMove rejects out-of-range cells and empty payloads", () => {
  assertEquals(decodeMove(new Uint8Array([9])), null);
  assertEquals(decodeMove(new Uint8Array([255])), null);
  assertEquals(decodeMove(new Uint8Array([])), null);
});
