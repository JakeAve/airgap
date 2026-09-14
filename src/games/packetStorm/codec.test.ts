import { assertEquals, assertThrows } from "@std/assert";
import { decodeMove, encodeMove } from "./codec.ts";
import { BitWriter } from "@/lib/bits/mod.ts";
import { Move, WEAPONS } from "./logic.ts";

const move: Move = { dx: 4, angle: 90, power: 50, weapon: "packet" };

Deno.test("round trips without a seed at 4 bytes", () => {
  const payload = encodeMove(move, 7);
  assertEquals(payload.length, 4);
  assertEquals(decodeMove(payload), { ...move, checksum: 7, seed: undefined });
});

Deno.test("round trips with a seed at 5 bytes", () => {
  const payload = encodeMove(move, 7, 42);
  assertEquals(payload.length, 5);
  assertEquals(decodeMove(payload), { ...move, checksum: 7, seed: 42 });
});

Deno.test("a seeded payload padded to 6 bytes still decodes the seed", () => {
  const payload = encodeMove(move, 7, 42);
  const padded = new Uint8Array(6);
  padded.set(payload);
  assertEquals(decodeMove(padded), { ...move, checksum: 7, seed: 42 });
});

Deno.test("extremes round trip: dx, angle, power, and every weapon", () => {
  for (const dx of [-31, 31]) {
    assertEquals(decodeMove(encodeMove({ ...move, dx }, 0))?.dx, dx);
  }
  for (const angle of [0, 180]) {
    assertEquals(decodeMove(encodeMove({ ...move, angle }, 0))?.angle, angle);
  }
  for (const power of [0, 100]) {
    assertEquals(decodeMove(encodeMove({ ...move, power }, 0))?.power, power);
  }
  for (const weapon of WEAPONS) {
    assertEquals(
      decodeMove(encodeMove({ ...move, weapon }, 0))?.weapon,
      weapon,
    );
  }
});

Deno.test("decodeMove rejects a payload under 4 bytes", () => {
  assertEquals(decodeMove(new Uint8Array([0, 0, 0])), null);
});

Deno.test("decodeMove rejects a raw dx of 63", () => {
  const payload = new BitWriter()
    .write(63, 6)
    .write(0, 8)
    .write(0, 7)
    .write(0, 3)
    .write(0, 8)
    .bytes();
  assertEquals(decodeMove(payload), null);
});

Deno.test("decodeMove rejects an angle over 180", () => {
  const payload = new BitWriter()
    .write(31, 6)
    .write(181, 8)
    .write(0, 7)
    .write(0, 3)
    .write(0, 8)
    .bytes();
  assertEquals(decodeMove(payload), null);
});

Deno.test("decodeMove rejects a power over 100", () => {
  const payload = new BitWriter()
    .write(31, 6)
    .write(0, 8)
    .write(101, 7)
    .write(0, 3)
    .write(0, 8)
    .bytes();
  assertEquals(decodeMove(payload), null);
});

Deno.test("decodeMove rejects a weapon index over 3", () => {
  const payload = new BitWriter()
    .write(31, 6)
    .write(0, 8)
    .write(0, 7)
    .write(4, 3)
    .write(0, 8)
    .bytes();
  assertEquals(decodeMove(payload), null);
});

Deno.test("encodeMove throws on out-of-range dx, angle, power, and weapon", () => {
  assertThrows(() => encodeMove({ ...move, dx: 32 }, 0), RangeError);
  assertThrows(() => encodeMove({ ...move, dx: -32 }, 0), RangeError);
  assertThrows(() => encodeMove({ ...move, angle: 181 }, 0), RangeError);
  assertThrows(() => encodeMove({ ...move, power: 101 }, 0), RangeError);
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => encodeMove({ ...move, weapon: "laser" as any }, 0),
    RangeError,
  );
});

Deno.test("encodeMove throws on out-of-range checksum or seed", () => {
  assertThrows(() => encodeMove(move, 256), RangeError);
  assertThrows(() => encodeMove(move, -1), RangeError);
  assertThrows(() => encodeMove(move, 0, 256), RangeError);
  assertThrows(() => encodeMove(move, 0, -1), RangeError);
});
