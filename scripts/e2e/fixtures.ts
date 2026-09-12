// Builds fake-device fixtures from the real codec: a WAV for Chromium's fake
// microphone and a y4m video for its fake camera, both carrying `TEXT`.
import { encodeEnvelope } from "@/lib/envelope/envelope.ts";
import { buildFrames } from "@/lib/frames/frames.ts";
import { SoundEncoder } from "@/lib/transports/sound/soundEncoder.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { rasterize } from "@/lib/transports/qr/rasterize.ts";
import { SOUND_SAMPLE_RATE } from "@/lib/protocol.ts";

export const TEXT = "hello airgap";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

function fixtureFrames(): Uint8Array[] {
  const envelope = {
    type: 0,
    gameId: 0,
    sessionId: 1,
    seq: 0,
    payload: new TextEncoder().encode(TEXT),
  };
  return buildFrames(encodeEnvelope(envelope), 5);
}

async function microphoneWav(frames: Uint8Array[]): Promise<Uint8Array> {
  const encoder = await SoundEncoder.create({ sampleRate: SOUND_SAMPLE_RATE });
  const parts: Float32Array[] = [new Float32Array(SOUND_SAMPLE_RATE / 2)];
  const gap = new Float32Array(SOUND_SAMPLE_RATE * 0.15);
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const frame of frames) parts.push(encoder.encode(frame), gap);
  }
  encoder.dispose();
  const pcm = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const part of parts) {
    for (const v of part) {
      pcm[pos++] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    }
  }
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => wav[offset + i] = c.charCodeAt(0));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SOUND_SAMPLE_RATE, true);
  view.setUint32(28, SOUND_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(new Uint8Array(pcm.buffer), 44);
  return wav;
}

function cameraY4m(frames: Uint8Array[]): Uint8Array {
  const image = rasterize(new QrEncoder().encode(frames), 6);
  const luma = new Uint8Array(VIDEO_WIDTH * VIDEO_HEIGHT).fill(128);
  const left = (VIDEO_WIDTH - image.width) >> 1;
  const top = (VIDEO_HEIGHT - image.height) >> 1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      luma[(top + y) * VIDEO_WIDTH + left + x] =
        image.data[(y * image.width + x) * 4];
    }
  }
  const chroma = new Uint8Array((VIDEO_WIDTH / 2) * (VIDEO_HEIGHT / 2)).fill(
    128,
  );
  const text = new TextEncoder();
  const header = text.encode(
    `YUV4MPEG2 W${VIDEO_WIDTH} H${VIDEO_HEIGHT} F30:1 Ip A1:1 C420jpeg\n`,
  );
  const tag = text.encode("FRAME\n");
  const chunks = [header];
  for (let i = 0; i < 30; i++) chunks.push(tag, luma, chroma, chroma);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

export async function writeFixtures(
  dir: string,
): Promise<{ wav: string; y4m: string }> {
  const frames = fixtureFrames();
  const wav = `${dir}/mic.wav`;
  const y4m = `${dir}/cam.y4m`;
  await Deno.writeFile(wav, await microphoneWav(frames));
  await Deno.writeFile(y4m, cameraY4m(frames));
  return { wav, y4m };
}

if (import.meta.main) {
  console.log(await writeFixtures(Deno.args[0] ?? "."));
}
