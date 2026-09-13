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
    <section class="card">
      <h2>Checkers</h2>
      <a href="./checkers.html?role=host" class="link-card tx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" fill="currentColor" stroke="none"></rect>
            <rect x="13" y="13" width="8" height="8" fill="currentColor" stroke="none"></rect>
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
      <a href="./checkers.html?role=guest" class="link-card rx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" fill="currentColor" stroke="none"></rect>
            <rect x="13" y="13" width="8" height="8" fill="currentColor" stroke="none"></rect>
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
    <section class="card">
      <h2>Chess</h2>
      <a href="./chess.html?role=host" class="link-card tx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M12 3l1.8 2.8L17 4l-.6 3.6L20 9l-3 2.2.8 3.6-3.5-1.3L12 17l-2.3-3.5-3.5 1.3.8-3.6L4 9l3.6-1.4L7 4l3.2 1.8z"></path>
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
      <a href="./chess.html?role=guest" class="link-card rx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M12 3l1.8 2.8L17 4l-.6 3.6L20 9l-3 2.2.8 3.6-3.5-1.3L12 17l-2.3-3.5-3.5 1.3.8-3.6L4 9l3.6-1.4L7 4l3.2 1.8z"></path>
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
    <section class="card">
      <h2>Spaceships</h2>
      <a href="./spaceships.html?role=host" class="link-card tx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2c2.5 2.5 3.5 6 3.5 10 0 2-1 4-3.5 6-2.5-2-3.5-4-3.5-6 0-4 1-7.5 3.5-10z"></path>
            <path d="M8.5 15l-3 2v3l3-1.5M15.5 15l3 2v3l-3-1.5M10.5 18h3v3l-1.5 1-1.5-1z"></path>
          </svg>
        </span>
        <span class="text">
          <strong>New game</strong>
          <small>Host — call the first shot</small>
        </span>
        <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6"></path>
        </svg>
      </a>
      <a href="./spaceships.html?role=guest" class="link-card rx">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2c2.5 2.5 3.5 6 3.5 10 0 2-1 4-3.5 6-2.5-2-3.5-4-3.5-6 0-4 1-7.5 3.5-10z"></path>
            <path d="M8.5 15l-3 2v3l3-1.5M15.5 15l3 2v3l-3-1.5M10.5 18h3v3l-1.5 1-1.5-1z"></path>
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
