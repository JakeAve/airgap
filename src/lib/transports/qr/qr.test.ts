import { assert, assertEquals, assertThrows } from "@std/assert";
import encodeQR from "qr";
import { QrEncoder } from "./qrEncoder.ts";
import { QrDecoder } from "./qrDecoder.ts";
import { QR_GUEST_COLORS, rasterize } from "./rasterize.ts";
import { bytesToText, textToBytes } from "./bytesAsText.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";
import {
  FRAME_BYTES,
  MAX_FRAMES_PER_MESSAGE,
  MAX_PAYLOAD_BYTES,
} from "@/lib/protocol.ts";

const leg = { type: 1, seq: 0, session: 42 };

function message(length: number) {
  return {
    ...leg,
    payload: new Uint8Array(length).map((_, i) => (i * 131 + 7) & 0xff),
  };
}

Deno.test("bytes map to text and back without loss", () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assertEquals(textToBytes(bytesToText(all)), all);
  assertEquals(bytesToText(all).length, 256);
});

Deno.test("one frame round trips through a small code", () => {
  const frames = buildFrames(message(2));
  const matrix = new QrEncoder().encode(frames);
  assert(matrix.length <= 25);
  assertEquals(new QrDecoder().push(rasterize(matrix)), frames);
});

Deno.test("a whole message round trips through one code and reassembles", () => {
  const msg = message(MAX_PAYLOAD_BYTES);
  const frames = buildFrames(msg);
  assertEquals(frames.length, MAX_FRAMES_PER_MESSAGE);
  const decoded = new QrDecoder().push(
    rasterize(new QrEncoder().encode(frames), 3),
  );
  assertEquals(decoded, frames);
  const reassembler = new Reassembler();
  let last;
  for (const frame of decoded) last = reassembler.push(frame);
  assertEquals(last!.message, msg);
});

Deno.test("sound and qr frames are interchangeable in one reassembly", () => {
  const frames = buildFrames(message(6));
  const decodedByQr = new QrDecoder().push(
    rasterize(new QrEncoder().encode([frames[1]])),
  );
  const r = new Reassembler();
  r.push(frames[0]);
  r.push(decodedByQr[0]);
  assertEquals(r.push(frames[2]).message, message(6));
});

Deno.test("the code decodes in the site's colours and in plain black on white", () => {
  const frames = buildFrames(message(4));
  const matrix = new QrEncoder().encode(frames);
  assertEquals(new QrDecoder().push(rasterize(matrix, 4, 4)), frames);
  assertEquals(
    new QrDecoder().push(rasterize(matrix, 4, 4, QR_GUEST_COLORS)),
    frames,
  );
  const plain = { module: "#000000", background: "#ffffff" };
  assertEquals(new QrDecoder().push(rasterize(matrix, 4, 4, plain)), frames);
});

Deno.test("images without our frames decode to nothing", () => {
  const blank = {
    width: 64,
    height: 64,
    data: new Uint8ClampedArray(64 * 64 * 4).fill(255),
  };
  assertEquals(new QrDecoder().push(blank), []);
  const foreign = encodeQR("hello!", "raw");
  assertEquals(new QrDecoder().push(rasterize(foreign)), []);
  const frameSized = new QrDecoder().push(rasterize(encodeQR("hello", "raw")));
  assertEquals(frameSized.length, 1);
  assertEquals(new Reassembler().push(frameSized[0]).accepted, false);
});

Deno.test("encoder validates frame count and size", () => {
  const encoder = new QrEncoder();
  assertThrows(() => encoder.encode([]), RangeError);
  assertThrows(() => encoder.encode([new Uint8Array(3)]), RangeError);
  assertThrows(
    () =>
      encoder.encode(
        Array.from({ length: MAX_FRAMES_PER_MESSAGE + 1 }, () =>
          new Uint8Array(FRAME_BYTES)),
      ),
    RangeError,
  );
});
