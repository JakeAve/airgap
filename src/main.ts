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
    <section class="card">
      <h2>Tic-tac-toe</h2>
      <a href="./tictactoe.html?role=host" class="link-card tx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18"></path>
          </svg>
        </span>
        <span class="text">
          <strong>New game</strong>
          <small>Host — call the first move</small>
        </span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6"></path>
        </svg>
      </a>
      <a href="./tictactoe.html?role=guest" class="link-card rx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18"></path>
          </svg>
        </span>
        <span class="text">
          <strong>Join</strong>
          <small>Guest — answer a call</small>
        </span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6"></path>
        </svg>
      </a>
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
