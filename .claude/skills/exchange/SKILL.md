---
name: exchange
description: Use when working on how two Airgap devices move a message between them — the call/reply/ack handshake, Session, Link, the sound or QR transports, the codec worker, or the exchange screen. Carries what only hardware could tell us, including two approaches that failed. Not needed for game logic or UI that sits above a completed exchange.
---

# The exchange

One exchange is one round: the caller's payload delivered and confirmed, the
responder's payload delivered and confirmed. Setup is not a special case — it is
the round-0 exchange, whose call carries the seed and the host's first move.

```
caller    CALL  seq N, payload  ──►   transmits one pass, then listens
responder REPLY seq N, payload  ◄──   answers the moment the call decodes,
                                      repeats until acked
caller    ACK   seq N, empty    ──►   retransmitted on demand, see below
```

The caller is whoever holds the turn, so the roles swap every round. For round 0
the caller is the host, meaning whoever tapped a game rather than Join.

## Rules that are not obvious from the code

**No leg may overlap another.** A device cannot hear anything over its own
speaker. This was measured, not assumed: with echo cancellation and AGC off —
which the data tones require — a phone decoded its own message every 1.32 s for
45 s straight and never once heard its peer, then heard it in 10.5 s the moment
it stopped transmitting. Do not reintroduce simultaneous transmit and listen.

**Nothing waits on a guessed interval.** The responder answers on a complete
decoded message, never a timer. That phase-locks both devices to the end of a
transmission, so the caller knows when an answer is due: one turnaround plus one
pass of the responder's frames, both computable from the frame count and the
protocol's frame period. Turnaround is the only measured number — the speaker
tail and the room — and 50 ms is enough on real phones. It stays a knob.

**The microphone opens once and stays rolling.** `SoundTransport.listen()` opens
it before anything is transmitted; `receive()` reuses it. Reopening per leg lost
the ack outright, because `getUserMedia` is far too slow to run between legs.
Samples heard while we talk decode to nobody. Headless reacquisition fell from
1.71 s to 0.68 s when this changed.

**The leg type separates a peer's message from our own echo.** Within a round no
device awaits a type it also sends: the caller sends CALL and ACK and awaits
only REPLY; the responder sends only REPLY. So the envelope needs no sender or
role bit, and stale legs of earlier rounds fall to the seq check. This is why
there is no BYE type either — an out-of-turn message is exactly the case where a
device cannot tell its own echo from the peer's, so resigning is a value in the
game's payload and travels inside a normal round.

## Getting unstuck

No leg deadlocks; every one retries indefinitely, because a looping sender plus
a CRC means one clean window is enough. These rules are about how a stall ends.

- **The final ack cannot itself be acked** (the two-army problem), so it is not
  sent a hopeful number of times. After a round the roles swap, so the caller
  becomes the next round's responder and is already listening: a device awaiting
  a call that hears a reply for the previous round re-sends that round's ack.
  The peer asks as long as it needs to, the way TCP answers a retransmitted
  SYN-ACK.
- **The last round of a game is the exception**, because the winner stops
  listening and nobody is left to re-ask. Linger on the exchange screen after
  the final round, still answering duplicate replies — TCP's TIME_WAIT. What
  remains is that the loser's phone never learns its last move was seen; the
  move was delivered and the outcome is agreed, so it costs a screen the user
  dismisses.
- **Retries carry jitter.** Two sides retrying on cadences that happen to be
  equal can hold a bad phase and transmit over each other indefinitely.
  Randomising each retry is what makes them fall into step, as in Ethernet.
- **The escape from a stalled channel is the other channel.** Frames are
  identical across transports and the reassembler does not care which delivered
  them, so an exchange that will not finish over sound finishes over QR
  mid-round, with nothing renegotiated. Show attempt count and elapsed time so a
  stall is visible rather than a spinner, with the QR code already on screen and
  the camera one tap away.

## Ultrasound

Untested and not required. A live microphone makes iOS route output toward the
earpiece, which barely responds above 15 kHz. `setSinkId` does not exist on iOS
Safari, and `navigator.audioSession`'s `play-and-record` asks for the earpiece
rather than away from it. Audible is the default and the only protocol the
handshake has been proven on.

## Trying it

`deno task dev` serves HTTPS from `.certs/` (see README for mkcert). Open
`diag.html` on two phones, Start on both, then Handshake as host on one and
guest on the other. `deno task e2e` covers the parts fake devices can reach:
that the worker still decodes a peer while encoding for our own speaker, and
that a guest answers a call. Acoustic self-hearing needs real hardware.
