// Serves dist/ locally and rebuilds when src/ or static/ change.
import { serveDir } from "@std/http";
import { join } from "@std/path";
import { build } from "./build.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const PORT = Number(Deno.env.get("PORT") ?? 8000);

let building = Promise.resolve();
let pending = false;

function scheduleBuild() {
  if (pending) return;
  pending = true;
  building = building.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    pending = false;
    try {
      await build();
      console.log("rebuilt");
    } catch (err) {
      console.error(err);
    }
  });
}

await build();

Deno.serve({ port: PORT }, (req) => serveDir(req, { fsRoot: DIST }));

const watcher = Deno.watchFs([join(ROOT, "src"), join(ROOT, "static")]);
for await (const _event of watcher) {
  scheduleBuild();
}
