const TOAST_MS = 4000;

export function isInstalled(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone ===
      true ||
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches;
}

export function startApp(options: { home: boolean }): void {
  registerServiceWorker(options.home);
  if (isInstalled()) navigator.storage?.persist?.().catch(() => {});
  if (!options.home) holdWakeLock();
}

function registerServiceWorker(home: boolean) {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  if (!sw.controller) {
    sw.addEventListener("controllerchange", showOfflineToast, { once: true });
  }
  sw.register("./sw.js").then((registration) => {
    if (!home) return;
    registration.waiting?.postMessage("skip-waiting");
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed" && sw.controller) {
          installing.postMessage("skip-waiting");
        }
      });
    });
  }).catch((err) => {
    console.error("service worker registration failed", err);
  });
}

function showOfflineToast() {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = "Ready to play offline";
  document.body.append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

function holdWakeLock() {
  if (!("wakeLock" in navigator)) return;
  let requested = false;
  const request = () => {
    requested = true;
    navigator.wakeLock.request("screen").catch(() => {});
  };
  // WebKit rejects a page's first wake lock request outside a user gesture.
  document.addEventListener("click", request, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (requested && document.visibilityState === "visible") request();
  });
}
