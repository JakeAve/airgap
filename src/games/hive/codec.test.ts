import { assertEquals, assertThrows } from "@std/assert";
import { BitWriter } from "@/lib/bits/mod.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";
import { decodeMove, describeMove, encodeMove } from "./codec.ts";
import {
  type Hex,
  initialState,
  key,
  type Move,
  type Options,
  pieceId,
  type Side,
  type State,
} from "./logic.ts";

const OFF: Options = { fpga: false, probe: false, crane: false };

const h = (slot: number) => pieceId("host", slot);
const g = (slot: number) => pieceId("guest", slot);
const MB = 0;
const HS = 3;
const PK = 8;
const CR = 13;

const at = (q: number, r: number): Hex => ({ q, r });

function position(
  pieces: [number, Hex][],
  moves: number,
  toMove: Side = "host",
  options = OFF,
): State {
  const state = initialState(options);
  for (const [piece, hex] of pieces) {
    state.stacks.set(key(hex), [...(state.stacks.get(key(hex)) ?? []), piece]);
  }
  return { ...state, moves, toMove };
}

const move = (piece: number, to: Hex, thrown = false): Move => ({
  piece,
  to,
  thrown,
});

const leg = { type: 0, seq: 0, session: 1 };

Deno.test("a move round-trips through 2 bytes against the lowest-id neighbour", () => {
  const state = position([[h(MB), at(0, 0)], [g(MB), at(1, 0)]], 2);
  const payload = encodeMove(state, move(h(PK), at(0, -1)));
  assertEquals(payload.length, 2);
  assertEquals(decodeMove(state, payload), { move: move(h(PK), at(0, -1)) });
  assertEquals(describeMove(state, payload), "PK to 5 of MB");
});

Deno.test("the host's first move carries the option set", () => {
  const options: Options = { fpga: true, probe: false, crane: true };
  const state = initialState(options);
  const payload = encodeMove(state, move(h(PK), at(0, 0)));
  assertEquals(decodeMove(state, payload), {
    move: move(h(PK), at(0, 0)),
    options,
  });
  assertEquals(describeMove(state, payload), "PK placed");
});

Deno.test("climbing names the stack it lands on", () => {
  const state = position([[h(MB), at(0, 0)], [g(HS), at(1, 0)]], 4, "guest");
  const payload = encodeMove(state, move(g(HS), at(0, 0)));
  assertEquals(decodeMove(state, payload), { move: move(g(HS), at(0, 0)) });
  assertEquals(describeMove(state, payload), "HS to top of MB");
});

Deno.test("a throw keeps its flag and its reference", () => {
  const state = position(
    [[h(CR), at(0, 0)], [h(MB), at(-1, 0)], [g(PK), at(0, 1)]],
    6,
  );
  const payload = encodeMove(state, move(g(PK), at(1, 0), true));
  assertEquals(decodeMove(state, payload), {
    move: move(g(PK), at(1, 0), true),
  });
  assertEquals(describeMove(state, payload), "PK thrown to 1 of CR");
});

Deno.test("a move survives framing padding", () => {
  const state = position([[h(MB), at(0, 0)], [g(MB), at(1, 0)]], 2);
  const sent = move(h(PK), at(0, -1));
  const frames = buildFrames({ ...leg, payload: encodeMove(state, sent) });
  const r = new Reassembler();
  let last;
  for (const f of frames) last = r.push(f);
  assertEquals(decodeMove(state, last!.message!.payload), { move: sent });
});

Deno.test("trailing zero bytes are ignored", () => {
  const state = position([[h(MB), at(0, 0)], [g(MB), at(1, 0)]], 2);
  const payload = encodeMove(state, move(h(PK), at(0, -1)));
  const padded = new Uint8Array(5);
  padded.set(payload);
  assertEquals(decodeMove(state, padded), { move: move(h(PK), at(0, -1)) });
});

Deno.test("decodeMove rejects a short payload, an unknown piece, a missing reference, and dir 7", () => {
  const state = position([[h(MB), at(0, 0)], [g(MB), at(1, 0)]], 2);
  const raw = (piece: number, ref: number, dir: number) =>
    new BitWriter().write(piece, 5).write(ref, 5).write(dir, 3).write(0, 1)
      .write(0, 2).bytes();

  assertEquals(decodeMove(state, new Uint8Array([])), null);
  assertEquals(decodeMove(state, new Uint8Array([0])), null);
  assertEquals(decodeMove(state, raw(28, h(MB), 0)), null);
  assertEquals(decodeMove(state, raw(h(PK), 28, 0)), null);
  assertEquals(decodeMove(state, raw(h(PK), g(CR), 0)), null);
  assertEquals(decodeMove(state, raw(h(PK), h(MB), 7)), null);
  assertEquals(describeMove(state, raw(h(PK), g(CR), 0)), "unknown");
});

Deno.test("encodeMove throws when nothing but the mover is in play", () => {
  const state = position([[h(PK), at(0, 0)]], 1);
  assertThrows(() => encodeMove(state, move(h(PK), at(1, 0))), RangeError);
});
