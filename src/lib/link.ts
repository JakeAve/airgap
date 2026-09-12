// Ties games to transports: envelopes go out as frames over one transport and
// come back in over any number of them, reassembled together.
import {
  decodeEnvelope,
  encodeEnvelope,
  type Envelope,
} from "@/lib/envelope/envelope.ts";
import { buildFrames, Reassembler } from "@/lib/frames/frames.ts";
import { MAX_MESSAGE_ID } from "@/lib/protocol.ts";
import {
  aborted,
  abortError,
  type Transport,
  type TransportId,
} from "@/lib/transport.ts";

export interface LinkProgress {
  received: number;
  total: number;
}

export class Link {
  #transports = new Map<TransportId, Transport>();
  #nextMsgId = 0;

  constructor(transports: Transport[]) {
    for (const t of transports) this.#transports.set(t.id, t);
  }

  get transports(): TransportId[] {
    return [...this.#transports.keys()];
  }

  #transport(id: TransportId): Transport {
    const t = this.#transports.get(id);
    if (!t) throw new Error(`no ${id} transport`);
    return t;
  }

  /** Splits the envelope into frames and presents them until `signal` aborts. */
  send(
    envelope: Envelope,
    via: TransportId,
    signal: AbortSignal,
  ): Promise<void> {
    const msgId = this.#nextMsgId;
    this.#nextMsgId = (this.#nextMsgId + 1) & MAX_MESSAGE_ID;
    return this.#transport(via).send(
      buildFrames(encodeEnvelope(envelope), msgId),
      signal,
    );
  }

  /**
   * Listens on every transport in `via` at once and resolves with the first
   * complete, well-formed envelope. Rejects with an AbortError if `signal`
   * aborts first.
   */
  receive(
    via: TransportId[],
    signal: AbortSignal,
    onProgress?: (progress: LinkProgress) => void,
  ): Promise<Envelope> {
    const transports = via.map((id) => this.#transport(id));
    const stop = new AbortController();
    const reassembler = new Reassembler();

    const result = new Promise<Envelope>((resolve, reject) => {
      const onFrame = (frame: Uint8Array) => {
        const progress = reassembler.push(frame);
        if (!progress.accepted) return;
        onProgress?.({ received: progress.received, total: progress.total });
        if (!progress.message) return;
        try {
          resolve(decodeEnvelope(progress.message));
        } catch {
          reassembler.reset();
        }
      };
      for (const t of transports) t.receive(onFrame, stop.signal).catch(reject);
      aborted(signal).then(() => reject(abortError()));
    });

    return result.finally(() => stop.abort());
  }
}
