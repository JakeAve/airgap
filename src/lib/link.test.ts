import { assertEquals, assertRejects } from "@std/assert";
import { Link } from "./link.ts";
import { aborted, type Transport, type TransportId } from "./transport.ts";
import type { Envelope } from "@/lib/envelope/envelope.ts";

/** In-memory transport: every frame sent is delivered to every receiver of the same bus. */
class Bus {
  listeners = new Set<(frame: Uint8Array) => void>();
  transport(
    id: TransportId,
    options: { only?: (index: number) => boolean } = {},
  ): Transport {
    const listeners = this.listeners;
    return {
      id,
      async send(frames, signal) {
        frames.forEach((f, i) => {
          if (options.only?.(i) === false) return;
          for (const l of listeners) l(f);
        });
        await aborted(signal);
      },
      async receive(onFrame, signal) {
        listeners.add(onFrame);
        await aborted(signal);
        listeners.delete(onFrame);
      },
    };
  }
}

const envelope: Envelope = {
  type: 2,
  gameId: 7,
  sessionId: 999,
  seq: 3,
  payload: new Uint8Array(30).map((_, i) => i * 5),
};

Deno.test("a message sent over one transport is received over another", async () => {
  const bus = new Bus();
  const sender = new Link([bus.transport("sound")]);
  const receiver = new Link([bus.transport("sound"), bus.transport("qr")]);
  const stop = new AbortController();
  const progress: number[] = [];
  const received = receiver.receive(
    ["sound", "qr"],
    stop.signal,
    { onProgress: (p) => progress.push(p.received) },
  );
  const sending = sender.send(envelope, "sound", stop.signal);
  assertEquals(await received, envelope);
  assertEquals(progress, [1, 2, 3]);
  stop.abort();
  await sending;
  assertEquals(bus.listeners.size, 0);
});

Deno.test("frames from two transports reassemble into one message", async () => {
  const soundBus = new Bus();
  const qrBus = new Bus();
  const sender = new Link([
    soundBus.transport("sound", { only: (i) => i % 2 === 0 }),
    qrBus.transport("qr", { only: (i) => i % 2 === 1 }),
  ]);
  const receiver = new Link([
    soundBus.transport("sound"),
    qrBus.transport("qr"),
  ]);
  const stop = new AbortController();
  const received = receiver.receive(["sound", "qr"], stop.signal);
  const s1 = sender.send(envelope, "sound", stop.signal);
  const s2 = new Link([qrBus.transport("qr", { only: (i) => i % 2 === 1 })])
    .send(
      envelope,
      "qr",
      stop.signal,
    );
  assertEquals(await received, envelope);
  stop.abort();
  await Promise.all([s1, s2]);
});

Deno.test("receive rejects when aborted before anything arrives", async () => {
  const bus = new Bus();
  const link = new Link([bus.transport("qr")]);
  const stop = new AbortController();
  const pending = link.receive(["qr"], stop.signal);
  stop.abort();
  await assertRejects(() => pending, DOMException, "aborted");
});

Deno.test("unknown transports are refused", () => {
  const link = new Link([]);
  assertEquals(link.transports, []);
  let threw = false;
  try {
    link.send(envelope, "sound", new AbortController().signal);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("envelopes the accept predicate rejects are skipped", async () => {
  const bus = new Bus();
  const own = new Link([bus.transport("sound")]);
  const peer = new Link([bus.transport("sound")]);
  const receiver = new Link([bus.transport("sound")]);
  const stop = new AbortController();
  const echo: Envelope = { ...envelope, sessionId: 111 };

  const received = receiver.receive(["sound"], stop.signal, {
    accept: (e) => e.sessionId !== echo.sessionId,
  });
  const sendingEcho = own.send(echo, "sound", stop.signal);
  const sendingPeer = peer.send(envelope, "sound", stop.signal);

  assertEquals(await received, envelope);
  stop.abort();
  await Promise.all([sendingEcho, sendingPeer]);
  assertEquals(bus.listeners.size, 0);
});
