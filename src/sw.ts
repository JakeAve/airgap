/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Replaced with a unique id by scripts/build.ts so every build gets its own cache.
const BUILD_ID = "__BUILD_ID__";
const CACHE_PREFIX = "airgap-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;

// Relative to the service worker's location so the same build works locally
// and under a GitHub Pages project path.
const APP_SHELL = [
  "./",
  "./index.html",
  "./main.js",
  "./diag.html",
  "./diag.js",
  "./handshake.html",
  "./handshake.js",
  "./restore.html",
  "./restore.js",
  "./tictactoe.html",
  "./tictactoe.js",
  "./checkers.html",
  "./checkers.js",
  "./chess.html",
  "./chess.js",
  "./spaceships.html",
  "./spaceships.js",
  "./swarm.html",
  "./swarm.js",
  "./codec-worker.js",
  "./capture-worklet.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() =>
      self.skipWaiting()
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) =>
            name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
          )
          .map((name) => caches.delete(name)),
      )
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function networkFirst(
  request: Request,
  fallbackUrl: string,
): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true }) ??
      await cache.match(fallbackUrl);
    return cached ?? Response.error();
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
