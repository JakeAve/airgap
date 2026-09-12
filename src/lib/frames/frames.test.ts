import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  buildFrames,
  FrameError,
  type Message,
  parseFrame,
  Reassembler,
} from "./frames.ts";
import { FRAME_BYTES, MAX_PAYLOAD_BYTES } from "@/lib/protocol.ts";

function payload(length: number): Uint8Array {
  return new Uint8Array(length).map((_, i) => (i * 97 + 13) & 0xff);
}

const leg = { type: 1, seq: 2, session: 200 };

Deno.test("a short payload is one frame of the fixed size", () => {
  const frames = buildFrames({ ...leg, payload: payload(1) });
  assertEquals(frames.length, 1);
  assertEquals(frames[0].length, FRAME_BYTES);
  const parsed = parseFrame(frames[0])!;
  assertEquals(parsed.type, 1);
  assertEquals(parsed.seq, 2);
  assertEquals(parsed.session, 200);
  assertEquals(parsed.index, 0);
  assertEquals(parsed.total, 1);
  assertEquals(parsed.payload, new Uint8Array([13, 0]));
});

Deno.test("an empty payload is still one frame", () => {
  assertEquals(buildFrames({ ...leg, payload: new Uint8Array() }).length, 1);
});

Deno.test("frames split at the payload size and reassemble in order", () => {
  const msg: Message = { ...leg, payload: payload(5) };
  const frames = buildFrames(msg);
  assertEquals(frames.length, 3);
  const r = new Reassembler();
  let last;
  for (const f of frames) last = r.push(f);
  assertEquals(last!.received, 3);
  assertEquals(last!.message, { ...leg, payload: payload(6).fill(0, 5) });
});

Deno.test("reassembly tolerates out-of-order and duplicate frames", () => {
  const frames = buildFrames({ ...leg, payload: payload(6) });
  const r = new Reassembler();
  assert(r.push(frames[2]).accepted);
  assertEquals(r.push(frames[2]).accepted, false);
  assert(r.push(frames[0]).accepted);
  assertEquals(r.push(frames[0]).accepted, false);
  const done = r.push(frames[1]);
  assertEquals(done.received, 3);
  assertEquals(done.message!.payload, payload(6));
});

Deno.test("a frame from another leg discards the partial one", () => {
  const r = new Reassembler();
  const first = buildFrames({ ...leg, payload: payload(4) });
  const second = buildFrames({ ...leg, seq: 3, payload: payload(4) });
  r.push(first[0]);
  const p = r.push(second[0]);
  assertEquals(p.received, 1);
  assertEquals(p.total, 2);
  assertEquals(r.push(second[1]).message!.seq, 3);
});

Deno.test("frames the accept predicate rejects leave the partial one alone", () => {
  const r = new Reassembler();
  const ours = buildFrames({ ...leg, payload: payload(4) });
  const echo = buildFrames({ ...leg, session: 9, payload: payload(4) });
  const notEcho = (l: { session: number }) => l.session !== 9;
  r.push(ours[0], notEcho);
  assertEquals(r.push(echo[0], notEcho).accepted, false);
  assertEquals(r.push(ours[1], notEcho).message!.payload, payload(4));
});

Deno.test("corrupted, wrong-sized, and inconsistent frames are rejected", () => {
  const frame = buildFrames({ ...leg, payload: payload(2) })[0];
  const flipped = frame.slice();
  flipped[3] ^= 0x01;
  assertEquals(parseFrame(flipped), null);
  assertEquals(parseFrame(frame.slice(0, FRAME_BYTES - 1)), null);
  assertEquals(new Reassembler().push(flipped).accepted, false);
});

Deno.test("payload size and field limits are enforced", () => {
  assertEquals(
    buildFrames({ ...leg, payload: payload(MAX_PAYLOAD_BYTES) }).length,
    4,
  );
  assertThrows(
    () => buildFrames({ ...leg, payload: payload(MAX_PAYLOAD_BYTES + 1) }),
    FrameError,
  );
  assertThrows(
    () => buildFrames({ ...leg, type: 4, payload: payload(1) }),
    FrameError,
  );
  assertThrows(
    () => buildFrames({ ...leg, seq: 4, payload: payload(1) }),
    FrameError,
  );
  assertThrows(
    () => buildFrames({ ...leg, session: 256, payload: payload(1) }),
    FrameError,
  );
});
