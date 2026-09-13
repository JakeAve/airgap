// The page both turn games mount: each move goes out once over the checked
// channels and the opponent's next move is the only confirmation, so there is
// no handshake.
import { buildFrames, type Message } from "@/lib/frames/frames.ts";
import type { TransportId } from "@/lib/transport.ts";
import type { SoundProtocol } from "@/lib/transports/sound/ggwave.ts";
import { QrEncoder } from "@/lib/transports/qr/qrEncoder.ts";
import { QR_COLORS, QR_GUEST_COLORS } from "@/lib/transports/qr/rasterize.ts";
import { drawQr } from "@/adapters/screen.ts";
import { newSessionId, openLink, type PageLink } from "@/adapters/pageLink.ts";
import { accepts, MOVE, type Role } from "./turn.ts";

export interface TurnGame<S> {
  initial(): S;
  moveCount(state: S): number;
  turn(state: S): Role;
  over(state: S): boolean;
  /** The next state, or null when the payload is not a legal move in this state. */
  play(state: S, payload: Uint8Array): S | null;
  describe(payload: Uint8Array): string;
  render(state: S, role: Role): void;
  /** Status line once over(state) is true, e.g. "X wins, you win". */
  result(state: S, role: Role): string;
  /** Optional status line on the local player's turn in place of "your move". */
  prompt?(state: S, role: Role): string;
  /** Optional name for a side, e.g. "X", used in the status and the log. */
  label?(role: Role): string;
}

export interface TurnPage<S> {
  readonly state: S;
  readonly role: Role;
  /** True when devices are open, the session is known, and it is the local player's turn. */
  canMove(): boolean;
  /** The local player's move: applies it via game.play, renders, and transmits. No-op unless canMove(). */
  move(payload: Uint8Array): void;
}

const SETTINGS_KEY = "airgap.settings";

export function mountTurnPage<S>(game: TurnGame<S>): TurnPage<S> {
  const $ = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

  const log = (line: string) => {
    const el = $<HTMLPreElement>("log");
    el.textContent += `${new Date().toISOString().slice(11, 23)} ${line}\n`;
    el.scrollTop = el.scrollHeight;
  };

  const params = new URLSearchParams(location.search);
  let role: Role = params.get("role") === "guest" ? "guest" : "host";
  let qrColors = QR_COLORS;

  const chirp = $<HTMLInputElement>("chirp");
  const qrcode = $<HTMLInputElement>("qrcode");
  const protocol = $<HTMLSelectElement>("protocol");
  const passesInput = $<HTMLInputElement>("passes");
  const passes = () => Math.max(1, Math.floor(passesInput.valueAsNumber) || 1);
  const code = $<HTMLCanvasElement>("code");
  const camera = $<HTMLVideoElement>("camera");
  const ping = $<HTMLButtonElement>("ping");
  const qrEncoder = new QrEncoder();

  let link: PageLink | undefined;
  let state = game.initial();
  let session: number | undefined;
  let previousSession: number | undefined;
  let lastSent: Message | undefined;
  let showing: Message | undefined;
  let codeDismissed = false;
  let sounding: AbortController | undefined;
  let receiving: AbortController | undefined;

  const named = (of: Role) => game.label?.(of) ?? of;
  const playing = () =>
    game.label ? `${role} playing ${game.label(role)}` : role;

  function setRole(next: Role) {
    role = next;
    qrColors = role === "guest" ? QR_GUEST_COLORS : QR_COLORS;
    document.body.classList.remove("host", "guest");
    document.body.classList.add(role);
    params.set("role", role);
    history.replaceState(null, "", `?${params}`);
    if (role === "guest") {
      session = undefined;
      return;
    }
    do session = newSessionId(); while (session === previousSession);
  }

  function channels(): TransportId[] {
    return [
      ...(chirp.checked ? ["sound" as const] : []),
      ...(qrcode.checked ? ["qr" as const] : []),
    ];
  }

  function status() {
    const over = game.over(state);
    const [text, tone] = !link
      ? ["ready", ""]
      : over
      ? [game.result(state, role), ""]
      : channels().length === 0
      ? ["check chirp or qrcode", ""]
      : sounding
      ? ["sending", "tx"]
      : game.turn(state) === role
      ? [game.prompt?.(state, role) ?? "your move", "tx"]
      : !link.sound.listening && !link.qr.watching
      ? ["no mic or camera — check the log", ""]
      : [`waiting for ${named(role === "host" ? "guest" : "host")}`, "rx"];
    $("status").textContent = text;
    $("status").className = tone ? `mono ${tone}-text` : "mono";
    $("dot").className = tone ? `dot ${tone}` : "dot";
    $("again").hidden = !link || !over;
  }

  function drawCode() {
    if (showing && qrcode.checked && !codeDismissed) {
      drawQr(qrEncoder.encode(buildFrames(showing)), code, qrColors);
      code.hidden = false;
    } else {
      code.hidden = true;
    }
  }

  const describe = (m: Message) =>
    `${game.describe(m.payload)} seq ${m.seq} session ${m.session}`;

  function transmit(m: Message) {
    sounding?.abort();
    sounding = undefined;
    showing = m;
    codeDismissed = false;
    drawCode();
    log(`sent ${describe(m)} over ${channels().join(" + ") || "nothing"}`);
    if (link && chirp.checked) {
      const ctl = new AbortController();
      sounding = ctl;
      link.sound.protocol = protocol.value as SoundProtocol;
      link.sound.maxPasses = passes();
      link.link.send(m, "sound", ctl.signal)
        .catch((err) => log(`chirp failed: ${err}`))
        .finally(() => {
          if (sounding === ctl) sounding = undefined;
          status();
        });
    }
    status();
  }

  async function awaitMove() {
    receiving?.abort();
    receiving = undefined;
    if (!link || game.over(state) || game.turn(state) === role) return;
    const via: TransportId[] = [];
    if (link.sound.listening) via.push("sound");
    if (link.qr.watching) via.push("qr");
    if (via.length === 0) return;
    const ctl = new AbortController();
    receiving = ctl;
    while (!ctl.signal.aborted) {
      let m: Message;
      try {
        m = await link.link.receive(via, ctl.signal, {
          accept: (leg) =>
            accepts(game.moveCount(state), session, leg, previousSession),
        });
      } catch (err) {
        if (!ctl.signal.aborted) log(`receive failed: ${err}`);
        return;
      }
      const next = game.play(state, m.payload);
      if (next === null) {
        log(`dropped illegal ${describe(m)}`);
        continue;
      }
      ctl.abort();
      receiving = undefined;
      sounding?.abort();
      sounding = undefined;
      showing = undefined;
      session ??= m.session;
      log(`received ${describe(m)}`);
      moved(next);
    }
  }

  function moved(next: S) {
    state = next;
    game.render(state, role);
    drawCode();
    if (game.over(state)) log(`game over: ${game.result(state, role)}`);
    awaitMove();
    status();
  }

  function canMove(): boolean {
    return !!link && session !== undefined && game.turn(state) === role;
  }

  function move(payload: Uint8Array) {
    if (!canMove()) return;
    const next = game.play(state, payload);
    if (next === null) return;
    lastSent = {
      type: MOVE,
      seq: game.moveCount(state) % 4,
      session: session as number,
      payload,
    };
    ping.disabled = false;
    moved(next);
    transmit(lastSent);
  }

  async function syncChannels() {
    receiving?.abort();
    if (!link) return;
    try {
      if (chirp.checked) await link.sound.listen();
      else link.sound.stopListening();
    } catch (err) {
      log(`microphone failed: ${err}`);
    }
    if (!chirp.checked) {
      sounding?.abort();
      sounding = undefined;
    }
    try {
      if (qrcode.checked) await link.qr.watch();
      else link.qr.stopWatching();
    } catch (err) {
      log(`camera failed: ${err}`);
    }
    camera.hidden = !link.qr.watching;
    drawCode();
    awaitMove();
    status();
  }

  $("start").onclick = async () => {
    $("start").hidden = true;
    $("status").textContent = "opening devices";
    try {
      link = await openLink(code, camera);
      link.sound.log = log;
      // The two phones face each other screen to screen.
      link.qr.facing = "user";
    } catch (err) {
      log(`could not start: ${err}`);
      $("start").hidden = false;
      status();
      return;
    }
    log(
      `${playing()} at ${link.sampleRate} Hz, ${protocol.value}, ${passes()} passes, session ${
        session ?? "from the first move"
      }`,
    );
    ping.hidden = false;
    await syncChannels();
  };

  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  chirp.checked = saved.chirp ?? true;
  qrcode.checked = saved.qrcode ?? false;
  protocol.value = saved.protocol ?? protocol.value;
  if (!protocol.value) protocol.selectedIndex = 0;
  passesInput.value = saved.passes ?? passesInput.value;

  $("settings").onchange = (event) => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        chirp: chirp.checked,
        qrcode: qrcode.checked,
        protocol: protocol.value,
        passes: passes(),
      }),
    );
    if (event.target === chirp || event.target === qrcode) syncChannels();
  };

  const menu = $<HTMLDetailsElement>("menu");
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target as Node)) menu.open = false;
  });

  code.onclick = () => {
    codeDismissed = true;
    drawCode();
  };

  ping.onclick = () => {
    if (lastSent) transmit(lastSent);
  };

  function newGame(nextRole: Role) {
    receiving?.abort();
    sounding?.abort();
    sounding = undefined;
    previousSession = session;
    setRole(nextRole);
    state = game.initial();
    lastSent = undefined;
    showing = undefined;
    ping.disabled = true;
    log(
      `new game: ${playing()}, session ${session ?? "from the first move"}`,
    );
    moved(state);
  }

  $("replay").onclick = () => newGame(role);
  $("switch").onclick = () => newGame(role === "host" ? "guest" : "host");

  setRole(role);
  game.render(state, role);
  status();

  return {
    get state() {
      return state;
    },
    get role() {
      return role;
    },
    canMove,
    move,
  };
}
