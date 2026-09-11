import { assert, assertEquals, assertThrows } from "@std/assert";
import encodeQR from "qr";
import { chunkFramesForQr, QrEncoder } from "./qrEncoder.ts";
import { QrDecoder } from "./qrDecoder.ts";
import { rasterize } from "./rasterize.ts";
import { bytesToText, textToBytes } from "./bytesAsText.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";
import {
  FRAME_BYTES,
  MAX_MESSAGE_BYTES,
  QR_MAX_FRAMES_PER_CODE,
} from "@/lib/protocol.ts";

function message(length: number): Uint8Array {
  return new Uint8Array(length).map((_, i) => (i * 131 + 7) & 0xff);
}

Deno.test("bytes map to text and back without loss", () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assertEquals(textToBytes(bytesToText(all)), all);
  assertEquals(bytesToText(all).length, 256);
});

Deno.test("one frame round trips through a small code", () => {
  const frames = buildFrames(message(8), 3);
  const matrix = new QrEncoder().encode(frames);
  assert(matrix.length <= 29);
  assertEquals(new QrDecoder().push(rasterize(matrix)), frames);
});

Deno.test("a full code of frames round trips and reassembles", () => {
  const msg = message(MAX_MESSAGE_BYTES);
  const frames = buildFrames(msg, 12);
  const codes = chunkFramesForQr(frames);
  assertEquals(codes.length, 2);
  assertEquals(codes[0].length, QR_MAX_FRAMES_PER_CODE);
  const encoder = new QrEncoder();
  const decoder = new QrDecoder();
  const reassembler = new Reassembler();
  let last;
  for (const code of codes) {
    const decoded = decoder.push(rasterize(encoder.encode(code), 3));
    assertEquals(decoded, code);
    for (const frame of decoded) last = reassembler.push(frame);
  }
  assertEquals(last!.message, msg);
});

Deno.test("sound and qr frames are interchangeable in one reassembly", () => {
  const frames = buildFrames(message(39), 6);
  const decodedByQr = new QrDecoder().push(
    rasterize(new QrEncoder().encode([frames[1]])),
  );
  const r = new Reassembler();
  r.push(frames[0]);
  r.push(decodedByQr[0]);
  assertEquals(r.push(frames[2]).message!.subarray(0, 39), message(39));
});

Deno.test("images without our frames decode to nothing", () => {
  const blank = {
    width: 64,
    height: 64,
    data: new Uint8ClampedArray(64 * 64 * 4).fill(255),
  };
  assertEquals(new QrDecoder().push(blank), []);
  const foreign = encodeQR("hello", "raw");
  assertEquals(new QrDecoder().push(rasterize(foreign)), []);
});

Deno.test("encoder validates frame count and size", () => {
  const encoder = new QrEncoder();
  assertThrows(() => encoder.encode([]), RangeError);
  assertThrows(() => encoder.encode([new Uint8Array(3)]), RangeError);
  assertThrows(
    () =>
      encoder.encode(
        Array.from({ length: QR_MAX_FRAMES_PER_CODE + 1 }, () =>
          new Uint8Array(FRAME_BYTES)),
      ),
    RangeError,
  );
});
