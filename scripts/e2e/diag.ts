// Drives the diagnostics page in headless Chromium with a fake microphone and
// camera fed from fixtures.ts, so the whole path from device to decoded
// envelope runs without hardware. Expects `deno task build` to have run.
// Set CHROMIUM_PATH to use a Chromium outside Playwright's own cache.
import { serveDir } from "@std/http";
import { join } from "@std/path";
import { chromium } from "playwright";
import { TEXT, writeFixtures } from "./fixtures.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const BASE_PATH = "/airgap";

const fixtures = await writeFixtures(
  await Deno.makeTempDir({ prefix: "airgap-e2e-" }),
);

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

const PORT = server.addr.port;

const browser = await chromium.launch({
  executablePath: Deno.env.get("CHROMIUM_PATH"),
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${fixtures.wav}`,
    `--use-file-for-fake-video-capture=${fixtures.y4m}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const failures: string[] = [];
try {
  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => failures.push(`page error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(`console error: ${msg.text()}`);
  });

  await page.goto(`http://localhost:${PORT}${BASE_PATH}/diag.html`);
  await page.click("#start");
  await page.waitForFunction(
    () => document.querySelector("#worker-state")?.textContent === "ready",
    null,
    { timeout: 20_000 },
  );

  const receiveVia = async (label: string, button: string) => {
    await page.click(button);
    try {
      await page.waitForFunction(
        (expected) =>
          document.querySelector("#received-text")?.textContent === expected,
        TEXT,
        { timeout: 30_000 },
      );
      console.log(`${label}: ${await page.textContent("#receive-progress")}`);
    } catch {
      failures.push(`${label}: ${await page.textContent("#receive-progress")}`);
    }
  };
  await receiveVia("receive via sound", "#listen");
  await receiveVia("receive via qr", "#scan");
  await receiveVia("receive via both", "#receive-both");

  for (const via of ["sound", "qr"]) {
    await page.selectOption("#send-via", via);
    await page.click("#send");
    await page.waitForTimeout(via === "sound" ? 1500 : 300);
    await page.click("#send-stop");
    await page.waitForFunction(
      () =>
        document.querySelector("#log")?.textContent?.includes("send stopped"),
      null,
      { timeout: 5_000 },
    );
    console.log(`send via ${via}: stopped cleanly`);
  }
} finally {
  await browser.close();
  await server.shutdown();
}

if (failures.length) {
  console.error("e2e failures:\n" + failures.join("\n"));
  Deno.exit(1);
}
console.log("e2e ok");
