// Ties games to transports: messages go out as frames over one transport and
// come back in over any number of them, reassembled together.
import {
  buildFrames,
  type Leg,
  type Message,
  Reassembler,
} from "@/lib/frames/frames.ts";
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

export interface LinkReceiveOptions {
  onProgress?: (progress: LinkProgress) => void;
  /**
   * Frames whose leg this rejects are dropped before reassembly, so they can
   * neither complete a message nor disturb a partial one. It is how a session
   * ignores another pair's traffic, and how a device ignores its own echo.
   */
  accept?: (leg: Leg) => boolean;
}

export class Link {
  #transports = new Map<TransportId, Transport>();

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

  /** Splits the message into frames and presents them until `signal` aborts. */
  send(
    message: Message,
    via: TransportId,
    signal: AbortSignal,
  ): Promise<void> {
    return this.#transport(via).send(buildFrames(message), signal);
  }

  /**
   * Listens on every transport in `via` at once and resolves with the first
   * complete message whose frames `options.accept` allows. Rejects with an
   * AbortError if `signal` aborts first.
   */
  receive(
    via: TransportId[],
    signal: AbortSignal,
    options: LinkReceiveOptions = {},
  ): Promise<Message> {
    const transports = via.map((id) => this.#transport(id));
    const stop = new AbortController();
    const reassembler = new Reassembler();

    const result = new Promise<Message>((resolve, reject) => {
      const onFrame = (frame: Uint8Array) => {
        const progress = reassembler.push(frame, options.accept);
        if (!progress.accepted) return;
        options.onProgress?.({
          received: progress.received,
          total: progress.total,
        });
        if (progress.message) resolve(progress.message);
      };
      for (const t of transports) t.receive(onFrame, stop.signal).catch(reject);
      aborted(signal).then(() => reject(abortError()));
    });

    return result.finally(() => stop.abort());
  }
}
