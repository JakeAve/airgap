// Builds the static site into dist/: copies static/, bundles the app and the
// service worker for the browser, and stamps the service worker with a build id.
import { copy, emptyDir, walk } from "@std/fs";
import { join, relative, SEPARATOR } from "@std/path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");

async function bundle(entry: string, out: string) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "bundle",
      "--platform",
      "browser",
      "--minify",
      "--sourcemap",
      "linked",
      "-o",
      out,
      entry,
    ],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await cmd.output();
  if (!success) throw new Error(`bundle failed for ${entry}`);
}

const ENTRIES: [entry: string, out: string][] = [
  ["src/main.ts", "main.js"],
  ["src/sw.ts", "sw.js"],
  ["src/diag.ts", "diag.js"],
  ["src/handshake.ts", "handshake.js"],
  ["src/restore.ts", "restore.js"],
  ["src/games/ticTacToe/ui.ts", "tictactoe.js"],
  ["src/games/checkers/ui.ts", "checkers.js"],
  ["src/games/chess/ui.ts", "chess.js"],
  ["src/games/spaceships/ui.ts", "spaceships.js"],
  ["src/games/hive/ui.ts", "swarm.js"],
  ["src/games/packetStorm/ui.ts", "packetstorm.js"],
  ["src/codecWorker.ts", "codec-worker.js"],
  ["src/captureWorklet.ts", "capture-worklet.js"],
];

export async function build() {
  await emptyDir(DIST);
  await copy(join(ROOT, "static"), DIST, { overwrite: true });
  for (const [entry, out] of ENTRIES) await bundle(entry, join(DIST, out));

  const shell = ["./"];
  for await (const entry of walk(DIST, { includeDirs: false })) {
    const path = relative(DIST, entry.path).replaceAll(SEPARATOR, "/");
    if (path === "sw.js" || path.endsWith(".map")) continue;
    shell.push(`./${path}`);
  }

  const swPath = join(DIST, "sw.js");
  const sw = await Deno.readTextFile(swPath);
  await Deno.writeTextFile(
    swPath,
    sw.replaceAll("__BUILD_ID__", Date.now().toString(36))
      .replaceAll("__APP_SHELL__", JSON.stringify(shell.sort())),
  );
}

if (import.meta.main) {
  await build();
}
