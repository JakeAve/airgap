/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
// Both replaced by scripts/build.ts: a unique id per build, and every built file.
declare const __APP_SHELL__: string[];

const BUILD_ID = "__BUILD_ID__";
const CACHE_PREFIX = "airgap-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = __APP_SHELL__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(
        APP_SHELL.map((url) => new Request(url, { cache: "no-cache" })),
      )
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
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) =>
      cached ?? fetch(request)
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data !== "skip-waiting") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const open = clients.filter((client) =>
          client.url.startsWith(self.registration.scope)
        );
        // Swapping versions under a second open tab would break its in-progress game.
        if (open.length <= 1) return self.skipWaiting();
      },
    ),
  );
});
