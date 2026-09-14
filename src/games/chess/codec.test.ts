import { assertEquals } from "@std/assert";
import {
  decodeOrder,
  describeOrder,
  encodeOrder,
  PROMOTIONS,
} from "./codec.ts";
import type { Order } from "./logic.ts";
import { BitWriter } from "@/lib/bits/mod.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";

const leg = { type: 0, seq: 0, session: 1 };

function roundTrip(order: Order): Order | null {
  const frames = buildFrames({ ...leg, payload: encodeOrder(order) });
  const r = new Reassembler();
  let last;
  for (const f of frames) last = r.push(f);
  return decodeOrder(last!.message!.payload);
}

Deno.test("every kind and promotion survives framing padding", () => {
  assertEquals(
    roundTrip({ kind: "move", move: { from: 12, to: 28 }, offer: false }),
    { kind: "move", move: { from: 12, to: 28, promotion: "q" }, offer: false },
  );
  assertEquals(
    roundTrip({ kind: "move", move: { from: 12, to: 28 }, offer: true }),
    { kind: "move", move: { from: 12, to: 28, promotion: "q" }, offer: true },
  );
  for (const promotion of PROMOTIONS) {
    assertEquals(
      roundTrip({
        kind: "move",
        move: { from: 52, to: 60, promotion },
        offer: false,
      }),
      { kind: "move", move: { from: 52, to: 60, promotion }, offer: false },
    );
  }
  assertEquals(roundTrip({ kind: "draw" }), { kind: "draw" });
  assertEquals(roundTrip({ kind: "resign" }), { kind: "resign" });
});

Deno.test("a move is exactly one frame", () => {
  const frames = buildFrames({
    ...leg,
    payload: encodeOrder({
      kind: "move",
      move: { from: 8, to: 16 },
      offer: false,
    }),
  });
  assertEquals(frames.length, 1);
});

Deno.test("decodeOrder rejects a short payload and a draw or resign with stray bits", () => {
  assertEquals(decodeOrder(new Uint8Array([])), null);
  assertEquals(decodeOrder(new Uint8Array([0])), null);

  const strayDraw = new BitWriter()
    .write(2, 2)
    .write(1, 6)
    .write(0, 6)
    .write(0, 2)
    .bytes();
  assertEquals(decodeOrder(strayDraw), null);

  const strayResign = new BitWriter()
    .write(3, 2)
    .write(0, 6)
    .write(0, 6)
    .write(1, 2)
    .bytes();
  assertEquals(decodeOrder(strayResign), null);
});

Deno.test("describeOrder prints each kind", () => {
  assertEquals(
    describeOrder({ kind: "move", move: { from: 12, to: 28 }, offer: false }),
    "e2e4",
  );
  assertEquals(
    describeOrder({ kind: "move", move: { from: 12, to: 28 }, offer: true }),
    "e2e4 offering a draw",
  );
  assertEquals(
    describeOrder({
      kind: "move",
      move: { from: 52, to: 60, promotion: "q" },
      offer: false,
    }),
    "e7e8",
  );
  assertEquals(
    describeOrder({
      kind: "move",
      move: { from: 52, to: 60, promotion: "r" },
      offer: false,
    }),
    "e7e8r",
  );
  assertEquals(
    describeOrder({
      kind: "move",
      move: { from: 52, to: 60, promotion: "b" },
      offer: false,
    }),
    "e7e8b",
  );
  assertEquals(
    describeOrder({
      kind: "move",
      move: { from: 52, to: 60, promotion: "n" },
      offer: false,
    }),
    "e7e8n",
  );
  assertEquals(describeOrder({ kind: "draw" }), "draw");
  assertEquals(describeOrder({ kind: "resign" }), "resign");
  assertEquals(describeOrder(null), "unknown");
});
