// Drives the diagnostics page in headless Chromium with a fake microphone and
// camera fed from fixtures.ts, so the whole path from device to decoded
// message runs without hardware. Expects `deno task build` to have run.
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
  await page.click("#mic");
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

  // A camera turned on by hand stays rolling: scans reuse it and leave it open.
  await page.click("#cam");
  await page.waitForFunction(
    () => document.querySelector("#cam")?.textContent === "Turn off camera",
    null,
    { timeout: 10_000 },
  );
  await receiveVia("receive via qr with the camera already on", "#scan");
  const stillRolling = await page.evaluate(() =>
    document.querySelector<HTMLVideoElement>("#camera")?.srcObject !== null &&
    document.querySelector("#camera")?.hasAttribute("hidden") === false
  );
  if (stillRolling) console.log("camera: still rolling after the scan");
  else failures.push("camera: closed by a scan that did not open it");
  await page.click("#flip");
  await page.waitForFunction(
    () =>
      document.querySelector("#log")?.textContent?.includes(
        "camera facing user",
      ) && document.querySelector("#camera")?.classList.contains("mirrored"),
    null,
    { timeout: 10_000 },
  );
  await receiveVia("receive via qr after flipping the camera", "#scan");
  await page.click("#cam");

  await page.click("#play");
  await page.waitForTimeout(1500);
  await page.click("#play-stop");
  await page.waitForFunction(
    () => document.querySelector("#log")?.textContent?.includes("send stopped"),
    null,
    { timeout: 5_000 },
  );
  console.log("play via sound: stopped cleanly");

  // Transmitting and decoding at once. Sound against sound, because with the
  // camera fixture in view the QR path wins in a tenth of a second and proves
  // nothing: what matters is that the single codec worker still decodes the
  // peer while it encodes for our own speaker. Acoustic self-hearing only
  // happens on real devices; the accept predicate covers it in link.test.ts.
  await page.click("#play");
  await page.click("#listen");
  try {
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#received-text")?.textContent === expected,
      TEXT,
      { timeout: 30_000 },
    );
    console.log(
      `decode while transmitting over sound: ${await page.textContent(
        "#receive-progress",
      )}`,
    );
  } catch {
    failures.push(
      `decode while transmitting over sound: ${await page.textContent(
        "#receive-progress",
      )}`,
    );
  }
  await page.click("#play-stop");

  // An ultrasound send closes the rolling mic so iOS can leave its call audio
  // mode, and must reopen it afterwards without the page asking.
  await page.selectOption("#send-protocol", "ultrasound-fastest");
  await page.click("#play");
  await page.waitForTimeout(1000);
  await page.click("#play-stop");
  await receiveVia("receive via sound after an ultrasound send", "#listen");

  // The fixture message is a CALL, so a guest-role handshake should hear it and
  // answer, over sound with the reply also on screen as a code. With nobody to
  // ack, it gives up after its retries with the devices released, and Continue
  // goes on to the next page.
  await page.goto(
    `http://localhost:${PORT}${BASE_PATH}/handshake.html?role=guest&via=both&retries=2`,
  );
  await page.click("#start");
  try {
    await page.waitForFunction(
      () =>
        document.querySelector("#log")?.textContent?.includes(
          "call heard at",
        ) === true,
      null,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#log")?.textContent?.includes(
            "reply 1: transmitting",
          ) === true &&
        document.querySelector("#code")?.hasAttribute("hidden") === false,
      null,
      { timeout: 10_000 },
    );
    console.log("handshake: heard the call and answered it");
    await page.waitForFunction(
      () =>
        (document.querySelector("#outcome")?.textContent ?? "").startsWith(
          "failed: no ack to",
        ) &&
        document.querySelector("#camera")?.hasAttribute("hidden") === true &&
        document.querySelector("#continue")?.hasAttribute("hidden") === true &&
        document.querySelector("#retry")?.hasAttribute("hidden") === false,
      null,
      { timeout: 60_000 },
    );
    console.log("handshake: gave up after its retries, devices off");
    // Retry runs it again from the same page; Stop lands on Retry too.
    await page.click("#retry");
    await page.waitForFunction(
      () =>
        document.querySelector("#stop")?.hasAttribute("hidden") === false &&
        document.querySelector("#retry")?.hasAttribute("hidden") === true,
      null,
      { timeout: 10_000 },
    );
    await page.click("#stop");
    await page.waitForFunction(
      () =>
        document.querySelector("#outcome")?.textContent === "stopped" &&
        document.querySelector("#retry")?.hasAttribute("hidden") === false,
      null,
      { timeout: 10_000 },
    );
    console.log("handshake: retried, stopped, offered retry again");
  } catch {
    failures.push(`handshake: ${await page.textContent("#status")}`);
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
