# Math Duel (dhbWebDev)

Hosted Version: https://math.orion.alessioc42.dev/

Browser math games: **Rechenrennen** (multiplayer sum duel, `sumGame`) and **Zehnerübergang** (single-player tens drill). Vanilla ES modules in the browser, Node.js on the server. No bundler, no `package.json`.

## Run

**Local** (Node 22+):

```bash
node server/main.js          # → http://127.0.0.1:3000
node --test server/test/*.test.js
```

Env: `HOST` (default `127.0.0.1`), `PORT` (default `3000`, auto-fallback if busy), `STATIC_ROOT` (optional override for `index.html` root).

**Docker**:

```bash
docker build -t dhbwebdev-server .
docker run --rm -p 3000:3000 dhbwebdev-server
```

Image: `gcr.io/distroless/nodejs26-debian13`. CI on `main` publishes `ghcr.io/<owner>/dhbwebdev-server`.

| URL | Game |
|-----|------|
| `#/` | Home |
| `#/sumGame/lobby` · `#/sumGame/game` · `#/sumGame/highscores` | Rechenrennen (needs server) |
| `/src/zehneruebergang/index.html` | Zehnerübergang (static page, `localStorage` only) |

**Server API** (Rechenrennen): `POST /create` · `/join` · `/choose` · `/leave` · `/push` · `GET /lobbies` · `GET /events` (SSE).

---

## File tree

```
dhbWebDev/
├── index.html                 SPA shell: home, lobby/game/highscore markup for sumGame
├── Dockerfile                 Distroless Node 26 image; copies server/, index.html, src/
├── .dockerignore              Excludes .git, tests, README from image
│
├── server/
│   ├── main.js                Entry: start GameServer, bind HOST/PORT
│   ├── game.js                GameServer: lobbies, rounds, scoring, REST + SSE handlers
│   ├── http_sse.js            HTTP router with JSON bodies, CORS, Server-Sent Events
│   ├── static.js              Static file handler; resolveStaticRoot() finds index.html
│   └── test/
│       ├── game.test.js       End-to-end lobby/game flow via GameClient
│       ├── http_sse.test.js   SSECapableServer routing, SSE wire format
│       └── static.test.js     Static root resolution and asset serving
│
└── src/
    ├── main.js                Site entry: hash routing, lazy-imports sumGame
    ├── site.js                parseSiteHash() → home | sumGame; toggles data-active-game
    ├── style.css              Global styles (shell, lobby, game, equation chain, tables)
    │
    ├── ui/
    │   ├── feedback.js        Status tone classes (error/success/info/idle)
    │   └── shell.js           data-sum-game-route and data-game-phase on <html>
    │
    ├── assets/
    │   ├── favicon.ico
    │   └── icons/
    │       ├── fluent-sum.svg
    │       ├── mdi-difference.svg
    │       └── mdi-target.svg
    │
    ├── sumGame/               Rechenrennen (online duel)
    │   ├── main.js            DOM listeners, init router, reconnect saved session
    │   ├── config.js          SERVER_HOST, localStorage keys, high-score limit
    │   ├── game-settings.js   Round/difficulty defaults; readCreateLobbySettings()
    │   │
    │   ├── app/
    │   │   ├── state.js       In-memory state: session, game, stream, round history
    │   │   ├── storage.js     load/save session and high scores (localStorage)
    │   │   ├── routes.js      gameHash(), normalizeRoute() for lobby|game|highscores
    │   │   ├── router.js      Hash → route; redirects to game when session exists
    │   │   └── actions.js     create/join/leave lobby, open high scores
    │   │
    │   ├── network/
    │   │   ├── game-client.js HTTP + SSE client (create, join, choose, leave, events)
    │   │   ├── client.js      Singleton GameClient bound to SERVER_HOST
    │   │   └── stream.js      connectSession(); handles SSE game/lobby events
    │   │
    │   └── ui/
    │       ├── refs.js          getElementById map for all sumGame DOM nodes
    │       ├── format.js        Score/round formatting; currentPlayer() helper
    │       ├── icons.js         SVG URLs for play-info icons
    │       ├── equation-chain.js  Animated equation display; buildEquationPlan()
    │       └── render/
    │           ├── index.js     renderApp(); orchestrates all screens
    │           ├── lobby.js     Lobby status + enable/disable form controls
    │           ├── game.js      Timeline, options, equation, scoreboard
    │           └── highscores.js  Local high-score table from storage
    │
    └── zehneruebergang/       Standalone tens-transition game (not hash-routed)
        ├── index.html         Own page; linked from home nav
        ├── main.js            Timer, tasks, scoring, localStorage high scores
        ├── style.css          Game-specific layout
        └── sounds/
            └── pling.mp3      Correct-answer sound
```

### Routing

```
src/main.js          #/ → home, #/sumGame → import sumGame/main.js
src/site.js          data-active-game on <html>
sumGame/app/routes.js   #/sumGame/lobby | game | highscores
sumGame/app/router.js   session present → force game route (except highscores)
```
