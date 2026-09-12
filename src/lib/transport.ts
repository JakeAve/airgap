export type TransportId = "sound" | "qr";

/**
 * Moves frames between devices. Implementations own their device access and
 * stay open only for the life of the abort signal they are given.
 */
export interface Transport {
  readonly id: TransportId;
  /** Presents the frames over and over until `signal` aborts. */
  send(frames: Uint8Array[], signal: AbortSignal): Promise<void>;
  /** Delivers every frame seen until `signal` aborts. */
  receive(
    onFrame: (frame: Uint8Array) => void,
    signal: AbortSignal,
  ): Promise<void>;
}

export function abortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

/** Resolves when the signal aborts. */
export function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
