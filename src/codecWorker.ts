/// <reference lib="webworker" />
import type {
  FromWorker,
  ToWorker,
} from "@/lib/transports/codecWorkerProtocol.ts";
import { SoundEncoder } from "@/lib/transports/sound/soundEncoder.ts";
import { SoundDecoder } from "@/lib/transports/sound/soundDecoder.ts";
import { QrDecoder } from "@/lib/transports/qr/qrDecoder.ts";

declare const self: DedicatedWorkerGlobalScope;

let encoder: SoundEncoder | undefined;
let decoder: SoundDecoder | undefined;
const qrDecoder = new QrDecoder();
const pending: ToWorker[] = [];

function post(message: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(message, transfer);
}

async function init(sampleRate: number) {
  encoder = await SoundEncoder.create({ sampleRate });
  decoder = await SoundDecoder.create({ sampleRate });
  post({ type: "ready" });
  for (const message of pending.splice(0)) handle(message);
}

function handle(message: ToWorker) {
  switch (message.type) {
    case "init":
      init(message.sampleRate).catch((err) =>
        post({ type: "error", message: String(err) })
      );
      return;
    case "encodeSound": {
      if (!encoder) return void pending.push(message);
      encoder.protocol = message.protocol;
      const samples = encoder.encode(message.frame);
      post({ type: "encoded", id: message.id, samples }, [samples.buffer]);
      return;
    }
    case "sound": {
      if (!decoder) return;
      const frames = decoder.push(message.samples);
      if (frames.length) post({ type: "soundFrames", frames });
      return;
    }
    case "qr": {
      const frames = qrDecoder.push(message);
      post({ type: "qrFrames", id: message.id, frames });
      return;
    }
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  try {
    handle(event.data);
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
