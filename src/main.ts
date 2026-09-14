import {
  deleteSave,
  GAME_PAGES,
  type GameId,
  lastPlayed,
  listSaves,
  type Save,
} from "@/games/saves.ts";

const CHEVRON =
  `<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 6l6 6-6 6"></path>
</svg>`;

const GAMES = [
  {
    id: "tictactoe" as GameId,
    name: "Tic-tac-toe",
    page: "./tictactoe.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path class="x" d="M3.5 8.5l7 7M10.5 8.5l-7 7"></path>
      <circle class="o" cx="17" cy="12" r="3.5"></circle>
    </svg>`,
  },
  {
    id: "checkers" as GameId,
    name: "Checkers",
    page: "./checkers.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <rect class="x" x="3" y="3" width="8" height="8" fill="currentColor" stroke="none"></rect>
      <rect class="o" x="13" y="13" width="8" height="8" fill="currentColor" stroke="none"></rect>
    </svg>`,
  },
  {
    id: "chess" as GameId,
    name: "Chess",
    page: "./chess.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path class="x" d="M6 19l1.5-8L4 7l5 2 3-6 3 6 5-2-3.5 4L18 19z"></path>
      <path class="o" d="M6 21h12"></path>
    </svg>`,
  },
  {
    id: "spaceships" as GameId,
    name: "Spaceships",
    page: "./spaceships.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path class="x" d="M12 2c2.5 2.5 3.5 6 3.5 10 0 2-1 4-3.5 6-2.5-2-3.5-4-3.5-6 0-4 1-7.5 3.5-10z"></path>
      <path class="o" d="M8.5 15l-3 2v3l3-1.5M15.5 15l3 2v3l-3-1.5M10.5 18h3v3l-1.5 1-1.5-1z"></path>
    </svg>`,
  },
  {
    id: "swarm" as GameId,
    name: "Swarm",
    page: "./swarm.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path class="x" d="M21 12l-4.5 7.8h-9L3 12l4.5-7.8h9z"></path>
      <circle class="o" cx="12" cy="12" r="2" fill="currentColor" stroke="none"></circle>
    </svg>`,
  },
  {
    id: "packetstorm" as GameId,
    name: "Packet Storm",
    page: "./packetstorm.html",
    icon:
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path class="x" d="M4 16c3-9 11-11 16-6"></path>
      <path class="o" d="M2 21h5v-3h4v-2h4v3h7"></path>
    </svg>`,
  },
];

const GAMES_BY_ID = Object.fromEntries(
  GAMES.map((game) => [game.id, game]),
) as Record<GameId, typeof GAMES[number]>;

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

type Tab = "new" | "resume";

let activeTab: Tab = "new";
let deleteArmedId: string | undefined;
let deleteTimer: ReturnType<typeof setTimeout> | undefined;

function disarmDelete() {
  clearTimeout(deleteTimer);
  deleteTimer = undefined;
  deleteArmedId = undefined;
}

function saveCard(save: Save) {
  const game = GAMES_BY_ID[save.game];
  const verb = save.role === "host" ? "hosting" : "joined";
  const moves = save.count === 1 ? "1 move" : `${save.count} moves`;
  const deleteLabel = deleteArmedId === save.id ? "Confirm delete" : "Delete";
  return `
    <div class="card save">
      <a
        href="${GAME_PAGES[save.game]}?role=${save.role}&save=${save.id}"
        class="link-card"
      >
        <span class="icon">${game.icon}</span>
        <span class="text">
          <strong>${game.name}</strong>
          <small>${verb} · ${moves} · ${
    lastPlayed(save.playedAt, Date.now())
  }</small>
        </span>
        ${CHEVRON}
      </a>
      <div class="row save-actions">
        <button type="button" data-delete="${save.id}">${deleteLabel}</button>
      </div>
    </div>`;
}

function resumeWithQrCard() {
  return `
    <a href="./restore.html" class="card link-card">
      <span class="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
          <path d="M14 14h3v3h-3zM20 14v3M17 20h3"></path>
        </svg>
      </span>
      <span class="text">
        <strong>Resume with QR</strong>
        <small>Scan the other phone's Share game code</small>
      </span>
      ${CHEVRON}
    </a>`;
}

function newGamePanel() {
  return `
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

function resumePanel() {
  const saves = listSaves(localStorage);
  if (saves.length === 0) {
    return `
      ${resumeWithQrCard()}
      <div class="card dashed">
        <p class="muted">Games in progress appear here.</p>
      </div>`;
  }
  return `
    ${resumeWithQrCard()}
    ${saves.map(saveCard).join("")}`;
}

function tabsBar() {
  const count = listSaves(localStorage).length;
  const resumeLabel = count > 0 ? `Resume game (${count})` : "Resume game";
  return `
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected="${activeTab === "new"}"
        aria-controls="tab-panel"
        data-tab="new"
      >New game</button>
      <button
        type="button"
        role="tab"
        aria-selected="${activeTab === "resume"}"
        aria-controls="tab-panel"
        data-tab="resume"
      >${resumeLabel}</button>
    </div>`;
}

function render() {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  app.innerHTML = `
    ${tabsBar()}
    <div id="tab-panel" role="tabpanel">
      ${activeTab === "new" ? newGamePanel() : resumePanel()}
    </div>
  `;
}

function handleClick(event: MouseEvent) {
  const target = event.target as Element;

  const tabButton = target.closest<HTMLButtonElement>("[data-tab]");
  if (tabButton) {
    activeTab = tabButton.dataset.tab === "resume" ? "resume" : "new";
    disarmDelete();
    render();
    return;
  }

  const deleteButton = target.closest<HTMLButtonElement>("[data-delete]");
  if (deleteButton) {
    const id = deleteButton.dataset.delete!;
    if (deleteArmedId === id) {
      disarmDelete();
      deleteSave(localStorage, id);
    } else {
      disarmDelete();
      deleteArmedId = id;
      deleteTimer = setTimeout(() => {
        disarmDelete();
        render();
      }, 3000);
    }
    render();
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.error("service worker registration failed", err);
  });
}

document.querySelector<HTMLElement>("#app")?.addEventListener(
  "click",
  handleClick,
);
render();
registerServiceWorker();
