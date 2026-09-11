// @ts-types="../../../../types/ggwave.d.ts"
import ggwaveFactory from "ggwave";
import type {
  GgwaveInstance,
  GgwaveModule,
  GgwaveParameters,
  GgwaveProtocolId,
} from "../../../../types/ggwave.d.ts";
import {
  FRAME_BYTES,
  SOUND_SAMPLE_RATE,
  SOUND_SAMPLES_PER_BLOCK,
} from "@/lib/protocol.ts";

export type { GgwaveInstance, GgwaveModule, GgwaveProtocolId };

export type SoundProtocol = "fastest" | "fast" | "normal";

let modulePromise: Promise<GgwaveModule> | undefined;

/** The WASM module is loaded once and shared by every encoder and decoder. */
export function loadGgwave(): Promise<GgwaveModule> {
  modulePromise ??= ggwaveFactory().then((g) => {
    g.disableLog();
    return g;
  });
  return modulePromise;
}

export function frameParameters(g: GgwaveModule): GgwaveParameters {
  return {
    ...g.getDefaultParameters(),
    payloadLength: FRAME_BYTES,
    sampleRateInp: SOUND_SAMPLE_RATE,
    sampleRateOut: SOUND_SAMPLE_RATE,
    sampleRate: SOUND_SAMPLE_RATE,
    samplesPerFrame: SOUND_SAMPLES_PER_BLOCK,
    sampleFormatInp: g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32,
    sampleFormatOut: g.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32,
  };
}

export function protocolId(
  g: GgwaveModule,
  protocol: SoundProtocol,
): GgwaveProtocolId {
  switch (protocol) {
    case "fastest":
      return g.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST;
    case "fast":
      return g.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST;
    case "normal":
      return g.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL;
  }
}

export const AUDIBLE_PROTOCOLS: readonly SoundProtocol[] = [
  "fastest",
  "fast",
  "normal",
];
