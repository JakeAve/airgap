import type { Role } from "@/games/turn.ts";

export type GameId =
  | "tictactoe"
  | "checkers"
  | "chess"
  | "spaceships"
  | "swarm";

export const GAME_PAGES: Record<GameId, string> = {
  tictactoe: "./tictactoe.html",
  checkers: "./checkers.html",
  chess: "./chess.html",
  spaceships: "./spaceships.html",
  swarm: "./swarm.html",
};

export const MAX_SAVES_PER_GAME = 3;

export type SaveStorage = Pick<Storage, "getItem" | "setItem">;

export interface Save {
  id: string;
  game: GameId;
  role: Role;
  session: number;
  count: number;
  playedAt: number;
  moves: number[][];
  data?: unknown;
}

const STORAGE_KEY = "airgap.saves";

function readAll(storage: SaveStorage): Save[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(storage: SaveStorage, saves: Save[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

export function listSaves(storage: SaveStorage): Save[] {
  return readAll(storage).sort((a, b) => b.playedAt - a.playedAt);
}

export function getSave(storage: SaveStorage, id: string): Save | undefined {
  return readAll(storage).find((s) => s.id === id);
}

export function putSave(storage: SaveStorage, save: Save): void {
  const saves = readAll(storage);
  const byId = saves.findIndex((s) => s.id === save.id);
  const bySession = byId !== -1
    ? byId
    : saves.findIndex((s) =>
      s.game === save.game && s.session === save.session
    );

  if (bySession !== -1) {
    saves[bySession] = save;
  } else {
    saves.push(save);
  }

  const evicted = new Set(
    saves
      .filter((s) => s.game === save.game)
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(MAX_SAVES_PER_GAME)
      .map((s) => s.id),
  );

  writeAll(storage, saves.filter((s) => !evicted.has(s.id)));
}

export function deleteSave(storage: SaveStorage, id: string): void {
  writeAll(storage, readAll(storage).filter((s) => s.id !== id));
}

export function newSaveId(): string {
  return crypto.randomUUID();
}

function roleByte(role: Role): number {
  return role === "host" ? 0 : 1;
}

function byteToRole(byte: number): Role | null {
  if (byte === 0) return "host";
  if (byte === 1) return "guest";
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function encodeShare(save: Save): string {
  const opponent: Role = save.role === "host" ? "guest" : "host";
  const bytes: number[] = [save.session & 0xff, roleByte(opponent)];
  for (const move of save.moves) {
    bytes.push(move.length, ...move);
  }
  return toBase64Url(Uint8Array.from(bytes));
}

export function decodeShare(
  game: GameId,
  text: string,
): Pick<Save, "game" | "role" | "session" | "count" | "moves"> | null {
  const bytes = fromBase64Url(text);
  if (bytes === null || bytes.length < 2) return null;

  const role = byteToRole(bytes[1]);
  if (role === null) return null;

  const moves: number[][] = [];
  let i = 2;
  while (i < bytes.length) {
    const len = bytes[i];
    i += 1;
    if (len > 8 || i + len > bytes.length) return null;
    moves.push(Array.from(bytes.slice(i, i + len)));
    i += len;
  }

  return { game, role, session: bytes[0], count: moves.length, moves };
}

export function gameLink(text: string, base: URL): URL | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.origin !== base.origin) return null;

  const dirOf = (u: URL) => u.pathname.slice(0, u.pathname.lastIndexOf("/"));
  if (dirOf(url) !== dirOf(base)) return null;

  const fileName = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  const game = (Object.keys(GAME_PAGES) as GameId[]).find(
    (g) => GAME_PAGES[g] === `./${fileName}`,
  );
  if (!game) return null;

  const match = /^#r=(.*)$/.exec(url.hash);
  if (!match || decodeShare(game, match[1]) === null) return null;

  return url;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function lastPlayed(playedAt: number, now: number): string {
  const diff = now - playedAt;
  if (diff < 60 * 1000) return "last played just now";

  const rtf = new Intl.RelativeTimeFormat("en");
  for (const [unit, ms] of RELATIVE_UNITS) {
    const value = Math.floor(diff / ms);
    if (value >= 1) return `last played ${rtf.format(-value, unit)}`;
  }
  return "last played just now";
}
