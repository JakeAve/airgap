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
    <div class="rule">
      <span class="label tx">Games</span>
    </div>
    <section class="card dashed">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="muted" aria-hidden="true">
        <path d="M4 12h4"></path><path d="M16 12h4"></path>
        <path d="M9 8a5.5 5.5 0 0 1 0 8"></path><path d="M15 16a5.5 5.5 0 0 1 0-8"></path>
      </svg>
      <h2 class="mark" style="font-size: 13px; color: var(--fg)">No games yet</h2>
      <p class="muted">Games will appear here.</p>
    </section>
    <div class="rule">
      <span class="label">Tools</span>
    </div>
    <a href="./diag.html" class="card link-card">
      <span class="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12h3l2-6 3 12 3-9 2 3h5"></path>
        </svg>
      </span>
      <span class="text">
        <strong>Transport diagnostics</strong>
        <small>Send a test message by sound or QR</small>
      </span>
      <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"></path>
      </svg>
    </a>
  `;
}

render();
registerServiceWorker();
