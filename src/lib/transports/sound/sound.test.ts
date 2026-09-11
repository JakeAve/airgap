import { assert, assertEquals, assertThrows } from "@std/assert";
import { SoundEncoder } from "./soundEncoder.ts";
import { SoundDecoder } from "./soundDecoder.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";
import { FRAME_BYTES, SOUND_SAMPLE_RATE } from "@/lib/protocol.ts";
import type { SoundProtocol } from "./ggwave.ts";

function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function withSilence(samples: Float32Array, noise = 0): Float32Array {
  const pad = SOUND_SAMPLE_RATE / 4;
  const out = new Float32Array(pad + samples.length + pad);
  out.set(samples, pad);
  if (noise > 0) {
    for (let i = 0; i < out.length; i++) out[i] += gaussian() * noise;
  }
  return out;
}

function decodeAll(
  decoder: SoundDecoder,
  samples: Float32Array,
  chunk: number,
): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let off = 0; off < samples.length; off += chunk) {
    frames.push(
      ...decoder.push(
        samples.subarray(off, Math.min(off + chunk, samples.length)),
      ),
    );
  }
  return frames;
}

const message = new Uint8Array(30).map((_, i) => (i * 53 + 0x80) & 0xff);

Deno.test("sound round trip of a multi-frame message through 128-sample pushes", async () => {
  const encoder = await SoundEncoder.create();
  const decoder = await SoundDecoder.create();
  const frames = buildFrames(message, 2);
  const reassembler = new Reassembler();
  let result;
  for (const frame of frames) {
    const decoded = decodeAll(decoder, withSilence(encoder.encode(frame)), 128);
    assertEquals(decoded.length, 1);
    assertEquals(decoded[0], frame);
    result = reassembler.push(decoded[0]);
  }
  assertEquals(result!.message!.subarray(0, message.length), message);
  encoder.dispose();
  decoder.dispose();
});

Deno.test("a 16-byte frame is about half a second on fastest and survives noise", async () => {
  const encoder = await SoundEncoder.create();
  const frame = buildFrames(message.subarray(0, 8), 0)[0];
  const samples = encoder.encode(frame);
  const seconds = samples.length / SOUND_SAMPLE_RATE;
  assert(seconds > 0.4 && seconds < 0.7, `got ${seconds}s`);
  const decoder = await SoundDecoder.create();
  assertEquals(decodeAll(decoder, withSilence(samples, 0.3), 4096), [frame]);
  encoder.dispose();
  decoder.dispose();
});

Deno.test("every audible protocol decodes with a single decoder", async () => {
  const encoder = await SoundEncoder.create();
  const decoder = await SoundDecoder.create();
  const frame = buildFrames(message, 1)[1];
  for (const protocol of ["fastest", "fast", "normal"] as SoundProtocol[]) {
    encoder.protocol = protocol;
    assertEquals(decodeAll(decoder, withSilence(encoder.encode(frame)), 1024), [
      frame,
    ], protocol);
  }
  encoder.dispose();
  decoder.dispose();
});

Deno.test("encoder rejects frames of the wrong size", async () => {
  const encoder = await SoundEncoder.create();
  assertThrows(
    () => encoder.encode(new Uint8Array(FRAME_BYTES - 1)),
    RangeError,
  );
  encoder.dispose();
});

Deno.test("silence and noise alone decode nothing", async () => {
  const decoder = await SoundDecoder.create();
  assertEquals(
    decodeAll(
      decoder,
      withSilence(new Float32Array(SOUND_SAMPLE_RATE), 0.2),
      1024,
    ),
    [],
  );
  decoder.dispose();
});
