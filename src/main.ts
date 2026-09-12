import { PROTOCOL_VERSION } from "@/lib/protocol.ts";

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.error("service worker registration failed", err);
  });
}

function render() {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  app.innerHTML = `
    <section class="card">
      <h2>No games yet</h2>
      <p>Games will appear here. Protocol version ${PROTOCOL_VERSION}.</p>
      <p><a href="./diag.html">Transport diagnostics</a></p>
    </section>
  `;
}

render();
registerServiceWorker();
