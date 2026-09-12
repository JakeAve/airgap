import { assertEquals } from "@std/assert";
import { decodeText, encodeText, MAX_TEXT_LENGTH } from "./codec.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";

const leg = { type: 0, seq: 0, session: 1 };

Deno.test("text survives framing padding", () => {
  for (const text of ["hi", "hello airgap", "a", "", "twelve, ok?!"]) {
    const frames = buildFrames({ ...leg, payload: encodeText(text) });
    const r = new Reassembler();
    let last;
    for (const f of frames) last = r.push(f);
    assertEquals(decodeText(last!.message!.payload), text);
  }
});

Deno.test("three characters per frame, twelve per message", () => {
  assertEquals(MAX_TEXT_LENGTH, 12);
  assertEquals(buildFrames({ ...leg, payload: encodeText("abc") }).length, 1);
  assertEquals(buildFrames({ ...leg, payload: encodeText("abcd") }).length, 2);
  assertEquals(
    buildFrames({ ...leg, payload: encodeText("hello airgap") }).length,
    4,
  );
});

Deno.test("case is dropped, unknown characters become spaces, overflow is cut", () => {
  assertEquals(decodeText(encodeText("Hi, Jake 1")), "hi, jake  ");
  assertEquals(decodeText(encodeText("abcdefghijklmnop")), "abcdefghijkl");
});
