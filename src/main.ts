const CHEVRON =
  `<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 6l6 6-6 6"></path>
</svg>`;

const GAMES = [
  {
    name: "Tic-tac-toe",
    page: "./tictactoe.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path class="x" d="M3.5 8.5l7 7M10.5 8.5l-7 7"></path>
      <circle class="o" cx="17" cy="12" r="3.5"></circle>
    </svg>`,
  },
  {
    name: "Checkers",
    page: "./checkers.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <rect class="x" x="3" y="3" width="8" height="8" fill="currentColor" stroke="none"></rect>
      <rect class="o" x="13" y="13" width="8" height="8" fill="currentColor" stroke="none"></rect>
    </svg>`,
  },
  {
    name: "Spaceships",
    page: "./spaceships.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path class="x" d="M12 2c2.5 2.5 3.5 6 3.5 10 0 2-1 4-3.5 6-2.5-2-3.5-4-3.5-6 0-4 1-7.5 3.5-10z"></path>
      <path class="o" d="M8.5 15l-3 2v3l3-1.5M15.5 15l3 2v3l-3-1.5M10.5 18h3v3l-1.5 1-1.5-1z"></path>
    </svg>`,
  },
];

function gameCard(game: typeof GAMES[number]) {
  return `
    <details class="card game" name="game">
      <summary class="link-card">
        <span class="icon">${game.icon}</span>
        <span class="text"><strong>${game.name}</strong></span>
        ${CHEVRON}
      </summary>
      <form action="${game.page}">
        <button name="role" value="host" class="tx">Host</button>
        <button name="role" value="guest" class="rx">Join</button>
      </form>
    </details>`;
}

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
    ${GAMES.map(gameCard).join("")}
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
