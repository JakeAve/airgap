import { assertEquals } from "@std/assert";
import {
  decodeReveal,
  decodeShot,
  encodeReveal,
  encodeShot,
  REVEAL,
  SHOT,
} from "./codec.ts";
import { type Fleet, type Result, SHIPS } from "./logic.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";

function roundTrip(type: number, payload: Uint8Array): Uint8Array {
  const r = new Reassembler();
  let last;
  for (const frame of buildFrames({ type, seq: 0, session: 1, payload })) {
    last = r.push(frame);
  }
  return last!.message!.payload;
}

const RESULTS: (Result | null)[] = [
  null,
  { outcome: "miss", ship: null },
  { outcome: "hit", ship: null },
  ...SHIPS.map((_, ship) => ({ outcome: "sunk" as const, ship })),
];

Deno.test("every result and cell survives framing padding", () => {
  for (const result of RESULTS) {
    for (const cell of [0, 1, 42, 99]) {
      const payload = roundTrip(SHOT, encodeShot(result, cell));
      assertEquals(decodeShot(payload), { result, cell });
    }
  }
});

Deno.test("a shot is one frame", () => {
  assertEquals(encodeShot(null, 0).length, 2);
  assertEquals(
    buildFrames({
      type: SHOT,
      seq: 0,
      session: 1,
      payload: encodeShot(null, 0),
    }).length,
    1,
  );
});

Deno.test("decodeShot rejects short payloads, bad cells, and stray ship bits", () => {
  assertEquals(decodeShot(new Uint8Array([1])), null);
  assertEquals(decodeShot(new Uint8Array([])), null);
  assertEquals(decodeShot(new Uint8Array([1, 100])), null);
  assertEquals(decodeShot(new Uint8Array([1, 255])), null);
  assertEquals(decodeShot(new Uint8Array([0b00000101, 0])), null);
  assertEquals(decodeShot(new Uint8Array([3 | (SHIPS.length << 2), 0])), null);
});

const FLEET: Fleet = [
  { bow: 0, vertical: false },
  { bow: 10, vertical: true },
  { bow: 25, vertical: false },
  { bow: 37, vertical: true },
  { bow: 98, vertical: false },
];

Deno.test("a fleet survives framing padding", () => {
  const payload = roundTrip(REVEAL, encodeReveal(FLEET));
  assertEquals(payload.length > SHIPS.length, true);
  assertEquals(decodeReveal(payload), FLEET);
});

Deno.test("decodeReveal rejects an overlapping or off-grid fleet", () => {
  const overlapping = encodeReveal([...FLEET.slice(0, 4), {
    bow: 2,
    vertical: false,
  }]);
  assertEquals(decodeReveal(overlapping), null);

  const offGrid = encodeReveal([...FLEET.slice(0, 4), {
    bow: 99,
    vertical: false,
  }]);
  assertEquals(decodeReveal(offGrid), null);

  const wrapping = encodeReveal([
    { bow: 7, vertical: false },
    ...FLEET.slice(1),
  ]);
  assertEquals(decodeReveal(wrapping), null);

  assertEquals(decodeReveal(new Uint8Array([0, 10, 25, 37])), null);
});
