// Confirms the service worker serves every page, the codec worker, the
// capture worklet, and the fonts with the network off. Expects `deno task
// build` to have run. Set CHROMIUM_PATH to use a Chromium outside
// Playwright's own cache.
import { serveDir } from "@std/http";
import { join } from "@std/path";
import { chromium, type Page } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const BASE_PATH = "/airgap";

const server = Deno.serve({ port: 0, onListen() {} }, (req) => {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
    return new Response("not found", { status: 404 });
  }
  return serveDir(req, {
    fsRoot: DIST,
    urlRoot: BASE_PATH.slice(1),
    quiet: true,
  });
});
const ORIGIN = `http://localhost:${server.addr.port}`;

const htmlFiles: string[] = [];
for await (const entry of Deno.readDir(DIST)) {
  if (entry.isFile && entry.name.endsWith(".html")) htmlFiles.push(entry.name);
}
htmlFiles.sort();

const browser = await chromium.launch({
  executablePath: Deno.env.get("CHROMIUM_PATH"),
});

const failures: string[] = [];

async function checkOffline(page: Page, url: string, label: string) {
  let response;
  try {
    response = await page.goto(url, { waitUntil: "load" });
  } catch (err) {
    failures.push(`${label}: navigation failed: ${(err as Error).message}`);
    return;
  }
  if (!response || !response.ok()) {
    failures.push(`${label}: navigation response ${response?.status()}`);
    return;
  }

  const fontLoaded = await page.evaluate(async () =>
    (await document.fonts.load("12px Silkscreen")).length > 0
  );
  if (!fontLoaded) failures.push(`${label}: Silkscreen font did not load`);

  const [workerOk, workletOk] = await page.evaluate(async () => {
    const ok = (p: Promise<Response>) => p.then((r) => r.ok).catch(() => false);
    return await Promise.all([
      ok(fetch("./codec-worker.js")),
      ok(fetch("./capture-worklet.js")),
    ]);
  });
  if (!workerOk) failures.push(`${label}: codec-worker.js fetch failed`);
  if (!workletOk) failures.push(`${label}: capture-worklet.js fetch failed`);
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (err) => failures.push(`page error: ${err.message}`));

  await page.goto(`${ORIGIN}${BASE_PATH}/`);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 20_000 },
  );

  await context.setOffline(true);

  for (const file of htmlFiles) {
    await checkOffline(page, `${ORIGIN}${BASE_PATH}/${file}?role=guest`, file);
  }
  await checkOffline(page, `${ORIGIN}${BASE_PATH}/`, "/ (scope root)");

  console.log(`checked ${htmlFiles.length} pages plus the scope root offline`);
} finally {
  await browser.close();
  await server.shutdown();
}

if (failures.length) {
  console.error("offline e2e failures:\n" + failures.join("\n"));
  Deno.exit(1);
}
console.log("offline e2e ok");
