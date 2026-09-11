import { assertEquals, assertThrows } from "@std/assert";
import { BitReader, BitWriter, crc8 } from "./mod.ts";

Deno.test("crc8 matches the CRC-8/SMBUS check value", () => {
  assertEquals(crc8(new TextEncoder().encode("123456789")), 0xf4);
});

Deno.test("crc8 of empty input is zero", () => {
  assertEquals(crc8(new Uint8Array()), 0);
});

Deno.test("bit writer packs fields most significant bit first", () => {
  const bytes = new BitWriter().write(0b101, 3).write(0b1, 1).write(0b1111, 4)
    .bytes();
  assertEquals(bytes, new Uint8Array([0b1011_1111]));
});

Deno.test("bit writer zero-pads a partial trailing byte", () => {
  assertEquals(
    new BitWriter().write(0b11, 2).bytes(),
    new Uint8Array([0b1100_0000]),
  );
  assertEquals(new BitWriter().bitLength, 0);
});

Deno.test("bit writer rejects values that do not fit", () => {
  assertThrows(() => new BitWriter().write(4, 2), RangeError);
  assertThrows(() => new BitWriter().write(-1, 2), RangeError);
  assertThrows(() => new BitWriter().write(1, 33), RangeError);
});

Deno.test("writer and reader round trip mixed widths including 32-bit", () => {
  const fields: [number, number][] = [
    [5, 3],
    [0, 1],
    [4095, 12],
    [0xdead_beef, 32],
    [1, 1],
    [77, 7],
  ];
  const w = new BitWriter();
  for (const [v, bits] of fields) w.write(v, bits);
  const r = new BitReader(w.bytes());
  for (const [v, bits] of fields) assertEquals(r.read(bits), v);
});

Deno.test("reader tracks remaining bits and refuses overruns", () => {
  const r = new BitReader(new Uint8Array([0xff, 0x00]));
  assertEquals(r.remaining, 16);
  assertEquals(r.read(12), 0xff0);
  assertEquals(r.remaining, 4);
  assertEquals(r.bytePosition, 2);
  assertThrows(() => r.read(5), RangeError);
});

Deno.test("writeBytes and readBytes round trip", () => {
  const data = new Uint8Array([1, 2, 250, 255]);
  const bytes = new BitWriter().write(1, 1).writeBytes(data).bytes();
  const r = new BitReader(bytes);
  assertEquals(r.read(1), 1);
  assertEquals(r.readBytes(4), data);
});
