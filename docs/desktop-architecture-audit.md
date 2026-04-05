# Desktop Architecture Audit

## Runtime shape

- The current project is already an Electron desktop app, not a React/Vite app.
- Entry point is now `electron/main.js`.
- Renderer pages are file-based HTML screens under `src/`.
- Shared authenticated API access lives in `shared/api.js`.
- Navigation is split between:
  - Electron IPC route changes for auth, role landing pages, and training flow.
  - Relative `window.location.href` changes inside player HTML pages.

## Top-level page groups

### Authentication
- `src/auth/login/index.html`
- `src/auth/register/index.html`

### Role dashboards
- `src/player/dashboard/dashboard.html`
- `src/admin/dashboard.html`
- `src/admin/tournaments.html`
- `src/referee/dashboard.html`
- `src/team_manager/dashboard.html`

### Player experience
- Dashboard: `src/player/dashboard/dashboard.html`
- News: `src/player/news/news.html`
- Recent games: `src/player/recent_games/recent_games.html`
- Matchmaking: `src/player/match/matchmaking.html`
- Streams: `src/player/stream/stream_dashboard.html`
- Stream detail: `src/player/stream/stream.html`
- Chat: `src/player/chat/chat.html`
- Chat detail: `src/player/chat/chat_detail.html`
- Missions: `src/player/missions/missions.html`
- Rewards: `src/player/rewards/rewards.html`
- Events: `src/player/events/events.html`
- Market: `src/player/market/market.html`
- Training dashboard: `src/player/training/dashboard.html`
- Training game: `src/player/training/game.html`
- Training result: `src/player/training/result.html`
- Channel setup: `src/player/channel/channel_dashboard.html`
- Stream studio: `src/player/stream/stream_studio.html`

## Electron route map

Named routes handled by IPC:

- `login`
- `register`
- `admin-dashboard`
- `admin-tournaments`
- `training-dashboard`
- `training-game`
- `training-result`
- `player-channel`
- `stream-studio`

Role landing pages:

- `player` -> `src/player/dashboard/dashboard.html`
- `admin` -> `src/admin/dashboard.html`
- `referee` -> `src/referee/dashboard.html`
- `team_manager` -> `src/team_manager/dashboard.html`

## Shared API layer

`shared/api.js` provides:

- `login(email, password)`
- `register(formData, role)`
- `logout()`
- `requireAuth()`
- `apiRequest(endpoint, options)`
- token storage and refresh

Base URL:

- `localStorage.arena_base_url`
- fallback: `http://localhost:3000/api`

## Confirmed connected endpoints

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/register/player`
- `POST /auth/register/team-manager`
- `POST /auth/register/referee`

### Riot integration
- `GET /riot-api/link-status`
- `POST /riot-api/link-account`
- `POST /riot-api/verify-account`
- `POST /riot-api/disconnect-account`
- `POST /riot-api/account`
- `GET /riot-api/match/:matchId`

### Matchmaking
- `GET /matchmaking/my-scheduled-tickets`
- `DELETE /matchmaking/queue/:ticketId`
- `GET /matchmaking/my-active-game`
- `GET /matchmaking/my-active-ticket`
- `POST /matchmaking/queue`
- `POST /matchmaking/games/:gameId/response`
- `POST /matchmaking/games/:gameId/acknowledge`

### Training
- `GET /training/leaderboard`
- `POST /training/result`

## Static or demo-only areas

These pages are currently UI-first and not connected to backend endpoints in this repository:

- `src/player/stream/stream_dashboard.html`
- `src/player/stream/stream.html`
- `src/player/chat/*.html`
- `src/player/news/news.html`
- `src/player/events/events.html`
- `src/player/market/market.html`
- `src/player/missions/missions.html`
- `src/player/rewards/rewards.html`
- `src/player/recent_games/recent_games.html`

## Architecture notes

- The player dashboard is a large hybrid page: static marketing/dashboard blocks plus real API-driven Riot and matchmaking modules embedded in inline scripts.
- Common player chrome is composed with `src/player/_common/loadComponents.js`, which injects `left_side_navbar.html`, `top_navbar.html`, and `right_navbar.html`.
- Renderer code relies on `require(...)` directly inside HTML and JS, so `nodeIntegration` remains enabled for compatibility.
- The new Electron folder isolates main-process concerns without forcing backend changes.
