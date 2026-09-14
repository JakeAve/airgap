import { assertEquals } from "@std/assert";
import { accepts, MOVE, replay } from "./turn.ts";

Deno.test("accepts a move frame whose seq and session match the awaited move", () => {
  assertEquals(accepts(0, 7, { type: MOVE, seq: 0, session: 7 }), true);
});

Deno.test("accepts rejects our own echo of the previous move", () => {
  assertEquals(accepts(1, 7, { type: MOVE, seq: 0, session: 7 }), false);
  assertEquals(accepts(1, 7, { type: MOVE, seq: 1, session: 7 }), true);
});

Deno.test("accepts rejects a frame from a different session", () => {
  assertEquals(accepts(0, 7, { type: MOVE, seq: 0, session: 9 }), false);
});

Deno.test("accepts any session before the first move when ours is unknown", () => {
  assertEquals(
    accepts(0, undefined, { type: MOVE, seq: 0, session: 42 }),
    true,
  );
});

Deno.test("accepts requires an unknown session's game to be unstarted", () => {
  assertEquals(
    accepts(1, undefined, { type: MOVE, seq: 1, session: 42 }),
    false,
  );
});

Deno.test("accepts ignores the previous game's session when joining a replay", () => {
  const leg = { type: MOVE, seq: 0, session: 42 };
  assertEquals(accepts(0, undefined, leg, 42), false);
  assertEquals(accepts(0, undefined, leg, 7), true);
});

Deno.test("accepts rejects a non-move frame type", () => {
  assertEquals(accepts(0, 7, { type: MOVE + 1, seq: 0, session: 7 }), false);
});

const counter = {
  initial: () => 0,
  play: (state: number, payload: Uint8Array) =>
    payload[0] === state ? state + 1 : null,
};

Deno.test("replay plays a legal sequence from the initial state", () => {
  const moves = [0, 1, 2].map((n) => Uint8Array.of(n));
  assertEquals(replay(counter, moves), 3);
  assertEquals(replay(counter, []), 0);
});

Deno.test("replay returns null when one move is illegal", () => {
  const moves = [0, 2, 2].map((n) => Uint8Array.of(n));
  assertEquals(replay(counter, moves), null);
});
