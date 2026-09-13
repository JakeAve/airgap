import { assertEquals } from "@std/assert";
import { accepts, MOVE } from "./turn.ts";

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
