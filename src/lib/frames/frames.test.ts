import { assert, assertEquals, assertThrows } from "@std/assert";
import { buildFrames, FrameError, parseFrame, Reassembler } from "./frames.ts";
import {
  FRAME_BYTES,
  FRAME_PAYLOAD_BYTES,
  MAX_MESSAGE_BYTES,
} from "@/lib/protocol.ts";
import { decodeEnvelope, encodeEnvelope } from "@/lib/envelope/envelope.ts";

function message(length: number): Uint8Array {
  return new Uint8Array(length).map((_, i) => (i * 97 + 13) & 0xff);
}

Deno.test("a short message is one frame of the fixed size", () => {
  const frames = buildFrames(message(5), 3);
  assertEquals(frames.length, 1);
  assertEquals(frames[0].length, FRAME_BYTES);
  const parsed = parseFrame(frames[0])!;
  assertEquals(parsed.msgId, 3);
  assertEquals(parsed.index, 0);
  assertEquals(parsed.total, 1);
  assertEquals(parsed.payload.subarray(0, 5), message(5));
});

Deno.test("frames split at the payload size and reassemble in order", () => {
  const msg = message(FRAME_PAYLOAD_BYTES * 3 + 1);
  const frames = buildFrames(msg, 9);
  assertEquals(frames.length, 4);
  const r = new Reassembler();
  let last;
  for (const f of frames) last = r.push(f);
  assertEquals(last!.received, 4);
  assertEquals(last!.message!.subarray(0, msg.length), msg);
});

Deno.test("reassembly tolerates out-of-order and duplicate frames", () => {
  const msg = message(39);
  const frames = buildFrames(msg, 1);
  const r = new Reassembler();
  assert(r.push(frames[2]).accepted);
  assertEquals(r.push(frames[2]).accepted, false);
  assert(r.push(frames[0]).accepted);
  assertEquals(r.push(frames[0]).accepted, false);
  const done = r.push(frames[1]);
  assertEquals(done.received, 3);
  assertEquals(done.message!.subarray(0, 39), msg);
});

Deno.test("a frame from a new message discards the partial one", () => {
  const r = new Reassembler();
  const first = buildFrames(message(30), 4);
  const second = buildFrames(message(20), 5);
  r.push(first[0]);
  const p = r.push(second[0]);
  assertEquals(p.msgId, 5);
  assertEquals(p.received, 1);
  assertEquals(p.total, 2);
  assertEquals(r.push(second[1]).message!.subarray(0, 20), message(20));
});

Deno.test("corrupted, wrong-sized, and inconsistent frames are rejected", () => {
  const frame = buildFrames(message(3), 0)[0];
  const flipped = frame.slice();
  flipped[5] ^= 0x01;
  assertEquals(parseFrame(flipped), null);
  assertEquals(parseFrame(frame.slice(0, FRAME_BYTES - 1)), null);
  assertEquals(new Reassembler().push(flipped).accepted, false);
});

Deno.test("message size and msgId limits are enforced", () => {
  assertEquals(buildFrames(message(MAX_MESSAGE_BYTES), 15).length, 64);
  assertThrows(
    () => buildFrames(message(MAX_MESSAGE_BYTES + 1), 0),
    FrameError,
  );
  assertThrows(() => buildFrames(new Uint8Array(), 0), FrameError);
  assertThrows(() => buildFrames(message(1), 16), FrameError);
});

Deno.test("an envelope survives framing padding", () => {
  const env = { type: 1, gameId: 2, sessionId: 3, seq: 4, payload: message(8) };
  const frames = buildFrames(encodeEnvelope(env), 7);
  assertEquals(frames.length, 1);
  const { message: bytes } = new Reassembler().push(frames[0]);
  assertEquals(decodeEnvelope(bytes!), env);
});
