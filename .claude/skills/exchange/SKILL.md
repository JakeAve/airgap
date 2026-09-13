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

**The microphone opens once and stays rolling, and so does the camera.**
`SoundTransport.listen()` opens the mic before anything is transmitted;
`receive()` reuses it. Reopening per leg lost the ack outright, because
`getUserMedia` is far too slow to run between legs. Samples heard while we talk
decode to nobody. Headless reacquisition fell from 1.71 s to 0.68 s when this
changed. `QrTransport.watch()` is the same idea for the camera: a scan with the
camera already rolling decodes in 0.03 s against 0.22 s cold. `flip()` swaps
front and rear by reopening, so it belongs between legs, not inside one.

**The leg is the state; the channel is only delivery.** Every outgoing leg is
drawn as a QR code for as long as it is current and, over sound, played on its
cadence. The awaited leg is accepted from whichever channel decodes it first.
Sound is half duplex (above) but QR is not: showing a code never blinds our own
camera, so the peer can read our screen mid-pass. QR alone therefore has no
windows and no retries — show the code and wait. With rear cameras only one
phone can see the other at a time, so in practice sound is the ambient channel
and QR is the one a person reaches for when a stall is visible.

**Who each leg informs.** The reply tells the host the guest has the call, so
the host can advance the turn the moment it decodes. The ack tells the guest the
host has the reply, so the ack is what lets the _guest_ advance. The host
sending the ack needs no mic or camera; it needs them only to hear a repeated
reply, which is what the linger below is for.

**The leg type separates a peer's message from our own echo.** Within a round no
device awaits a type it also sends: the caller sends CALL and ACK and awaits
only REPLY; the responder sends only REPLY. So the frame header needs no sender
or role bit, and stale legs of earlier rounds fall to the seq check. This is why
there is no BYE type either — an out-of-turn message is exactly the case where a
device cannot tell its own echo from the peer's, so resigning is a value in the
game's payload and travels inside a normal round.

## Getting unstuck

No leg deadlocks, because a repeating sender plus a CRC means one clean window
is enough. Retries are bounded, as TCP bounds SYN retries: `retries` calls
without a reply or replies without an ack end the run as a failure with the
devices off, rather than a spinner. Five on fastest is about fifteen seconds. A
guest awaiting its first call waits indefinitely, since the host may not have
started. These rules are about how a stall ends short of that.

- **The final ack cannot itself be acked** (the two-army problem), so it is not
  sent a hopeful number of times. After a round the roles swap, so the caller
  becomes the next round's responder and is already listening: a device awaiting
  a call that hears a reply for the previous round re-sends that round's ack.
  The peer asks as long as it needs to, the way TCP answers a retransmitted
  SYN-ACK. When there is no next round, the caller lingers after its ack with
  mic and camera on for exactly one responder retry — ack window, jitter, a
  turnaround and a reply pass, all computable — and re-acks if the reply comes
  again. Silence for that long means the responder has it, and only then do the
  devices go off. The diag handshake does this.
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
  the camera already rolling.

## The exchange screen

`handshake.html` (`src/handshake.ts`) is the screen games will use, chosen from
three drafted directions: the camera fills the page, our current leg floats on
it as a code, a flip button sits at the camera's corner, one status line runs
along the bottom with the log folded under it as a `<details>`. It never
scrolls; only the log does. Three states:

- **Ready.** A Start button and the message in the status line. iOS needs the
  tap before the mic, camera and audio context can open, so nothing opens on
  load. Role shows in the header; channel and protocol stay in the log's opening
  line, never on screen.
- **Running.** Status names the leg and attempt (`call 2: awaiting reply`, amber
  while transmitting, teal while listening) and the elapsed time ticks. Stop is
  in the header.
- **Done.** Mic and camera go off, the code disappears, the outcome and the
  peer's payload sit in the middle. Complete offers **Continue**, which goes to
  the `next` URL; failed or stopped offers **Retry**, which runs the same
  parameters again on the same page.

The received text is a diag convenience: the page decodes with the diag codec
because that is the only game it knows. A game decodes the payload with its own
codec and redraws its board; the shell — camera, code, status line, outcome — is
what carries over. `src/adapters/pageLink.ts` builds the worker and both
transports for any page; `diag.html` uses the same pieces for one-way tests and
its handshake form is a plain GET that builds the URL.

## Ultrasound

Untested and not required. A live microphone makes iOS route output toward the
earpiece, which barely responds above 15 kHz. `setSinkId` does not exist on iOS
Safari, and `navigator.audioSession`'s `play-and-record` asks for the earpiece
rather than away from it. Audible is the default and the only protocol the
handshake has been proven on.

## Trying it

`deno task dev` serves HTTPS from `.certs/` (see README for mkcert). Open
`handshake.html?role=host` on one phone and `handshake.html?role=guest` on the
other and tap Start on both; `via`, `text`, `protocol`, `turnaround`, `guard`,
`retries` and `next` are the other parameters, and the form on `diag.html`
builds the URL. The page is the exchange screen games will use: camera behind,
our current leg as a code on top, one status line, the log folded away.
`deno task e2e` covers the parts fake devices can reach: that the worker still
decodes a peer while encoding for our own speaker, and that a guest answers a
call. Acoustic self-hearing needs real hardware.
