import { assertEquals } from "@std/assert";
import {
  decodeShare,
  deleteSave,
  encodeShare,
  gameLink,
  getSave,
  lastPlayed,
  listSaves,
  MAX_SAVES_PER_GAME,
  newSaveId,
  putSave,
  type Save,
  type SaveStorage,
} from "./saves.ts";

function fakeStorage(): SaveStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function save(over: Partial<Save>): Save {
  return {
    id: newSaveId(),
    game: "tictactoe",
    role: "host",
    session: 1,
    count: 0,
    playedAt: 0,
    moves: [],
    ...over,
  };
}

Deno.test("putSave and getSave round trip, listSaves is most recent first", () => {
  const storage = fakeStorage();
  const a = save({ playedAt: 1 });
  const b = save({ playedAt: 2, session: 2 });
  putSave(storage, a);
  putSave(storage, b);

  assertEquals(getSave(storage, a.id), a);
  assertEquals(listSaves(storage).map((s) => s.id), [b.id, a.id]);
});

Deno.test("corrupt JSON reads as empty", () => {
  const storage = fakeStorage();
  storage.setItem("airgap.saves", "{not json");
  assertEquals(listSaves(storage), []);
});

Deno.test("deleteSave removes only that save", () => {
  const storage = fakeStorage();
  const a = save({});
  const b = save({});
  putSave(storage, a);
  putSave(storage, b);
  deleteSave(storage, a.id);
  assertEquals(listSaves(storage).map((s) => s.id), [b.id]);
});

Deno.test("putSave evicts the least recently played save beyond 3 per game", () => {
  const storage = fakeStorage();
  const saves = [1, 2, 3, 4].map((playedAt) =>
    save({ session: playedAt, playedAt })
  );
  for (const s of saves) putSave(storage, s);

  const ids = listSaves(storage).map((s) => s.id);
  assertEquals(ids.length, MAX_SAVES_PER_GAME);
  assertEquals(ids.includes(saves[0].id), false);
  assertEquals(getSave(storage, saves[0].id), undefined);
});

Deno.test("putSave keeps a different id with the same game+session as a separate save", () => {
  const storage = fakeStorage();
  const a = save({ session: 5, playedAt: 1, count: 1 });
  putSave(storage, a);

  const other = save({ id: newSaveId(), session: 5, playedAt: 2, count: 2 });
  putSave(storage, other);

  const all = listSaves(storage);
  assertEquals(all.length, 2);
  assertEquals(all.map((s) => s.id).sort(), [a.id, other.id].sort());
});

Deno.test("encodeShare/decodeShare round trip flips the role", () => {
  const s = save({ role: "host", session: 7, moves: [[1, 2], [3]] });
  const text = encodeShare(s);
  const decoded = decodeShare(s.game, text);
  assertEquals(decoded, {
    game: s.game,
    role: "guest",
    session: 7,
    count: 2,
    moves: [[1, 2], [3]],
  });
});

Deno.test("decodeShare rejects malformed input", () => {
  assertEquals(decodeShare("tictactoe", "not base64url!!"), null);
  assertEquals(decodeShare("tictactoe", ""), null);

  const oneByte = encodeShare(save({ moves: [] })).slice(0, 1);
  assertEquals(decodeShare("tictactoe", oneByte), null);

  const truncated = encodeShare(save({ moves: [[1, 2, 3]] })).slice(0, -1);
  assertEquals(decodeShare("tictactoe", truncated), null);

  const tooLong = encodeShare(
    save({ moves: [[1, 2, 3, 4, 5, 6, 7, 8, 9]] }),
  );
  assertEquals(decodeShare("tictactoe", tooLong), null);
});

Deno.test("gameLink rebuilds a game link on this page's origin and directory", () => {
  const base = new URL("https://example.com/airgap/restore.html");
  const text = encodeShare(save({ game: "chess", role: "host", session: 3 }));

  for (
    const shown of ["https://example.com/airgap", "https://10.0.0.84:8443"]
  ) {
    assertEquals(
      gameLink(`${shown}/chess.html?role=host#r=${text}`, base)?.href,
      `https://example.com/airgap/chess.html?role=guest#r=${text}`,
    );
  }
});

Deno.test("gameLink rejects a non-game page", () => {
  const base = new URL("https://example.com/airgap/saves.html");
  const text = encodeShare(save({ game: "chess" }));
  const url = `https://example.com/airgap/saves.html#r=${text}`;
  assertEquals(gameLink(url, base), null);
});

Deno.test("gameLink rejects a missing share and an unparseable url", () => {
  const base = new URL("https://example.com/airgap/saves.html");
  assertEquals(gameLink("https://example.com/airgap/chess.html", base), null);
  assertEquals(gameLink("not a url", base), null);
});

Deno.test("lastPlayed picks the largest whole unit", () => {
  const now = 10_000_000;
  assertEquals(lastPlayed(now - 30_000, now), "last played just now");
  assertEquals(lastPlayed(now - 60_000, now), "last played 1 minute ago");
  assertEquals(
    lastPlayed(now - 2 * 24 * 60 * 60 * 1000, now),
    "last played 2 days ago",
  );
});
