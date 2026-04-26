# JARVIS

JARVIS is now a **single local workspace** for voice-driven Copilot automation:

- **Frontend**: React + Vite control surface for voice input, command entry, terminal output, memories, and execution plans.
- **Backend**: Express + Socket.IO runtime that executes the Copilot CLI, persists conversations in SQLite, derives searchable memories, and serves the production frontend bundle.
- **Persistence**: SQLite stores conversations, generated memories, and the latest execution plan so the app can restore context on reload.

## Public website and docs

- **Site source**: `website/`
- **Landing page**: `website/index.html`
- **Developer docs**: `website/developer-docs.html`
- **Free hosting**: GitHub Pages via `.github/workflows/deploy-website.yml`

## Architecture

### Frontend

- Connects to the app endpoint from settings or `VITE_API_URL`
- Uses the same origin by default, so Vite proxying works cleanly in development and the backend-served bundle works in production
- Hydrates from `/api/app-state` on load
- Streams command output over Socket.IO
- Syncs the active conversation back to the backend when conversation memory is enabled

### Backend

- Exposes:
  - `GET /api/health`
  - `GET /api/app-state`
  - `GET /api/conversations`
  - `GET /api/conversations/:id`
  - `GET /api/memories`
  - `GET /api/project-plan`
  - `POST /api/speak`
- Stores every synced conversation and regenerates memory entries from recent user/assistant messages
- Tracks the latest execution pipeline as a project plan with step status
- Serves `frontend/dist` after a production build, so `npm start` is a unified app entry

## How memory works

1. The frontend keeps the active conversation in state.
2. When **Sync conversation memory** is enabled, that conversation is sent to the backend over Socket.IO.
3. The backend stores the full conversation in SQLite.
4. It then derives memory rows from recent non-system messages, tags them, scores importance, and makes them searchable in the Memories view and `/api/memories`.

## How command execution works

1. A text or voice prompt is submitted from the frontend.
2. The backend starts the configured Copilot CLI command (`COPILOT_COMMAND`, default `copilot`).
3. Output streams back live through Socket.IO into the terminal panel.
4. The backend stores an execution plan with dispatch, stream, and finalize steps.
5. When the command completes, the frontend refreshes app state so memories, runtime counts, and the project plan stay current.

## Local development

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Start the workspace

```bash
npm run dev
```

This runs:

- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:5000`

Vite proxies `/api` and `/socket.io` to the backend, so the browser can stay on the frontend origin.

## Production-style local run

```bash
npm run build
npm start
```

After the build, the backend serves the compiled frontend bundle and the API from the same process.

## Configuration

Backend config lives in `backend/.env`:

```env
PORT=5000
NODE_ENV=development
DB_PATH=./jarvis.db
FRONTEND_ORIGIN=http://localhost:3000
COPILOT_COMMAND=copilot
```

Frontend config can use `VITE_API_URL` if you need to point the UI at a different app origin.

## Key files

- `frontend/src/App.tsx` - main dashboard state and socket orchestration
- `frontend/src/services/api.ts` - app-state bootstrap helpers
- `backend/src/server.ts` - API, Socket.IO, runtime wiring, and production static serving
- `backend/src/db/database.ts` - SQLite persistence for conversations, memories, and plans
- `backend/src/copilot/copilot-service.ts` - Copilot CLI execution and availability checks

## Notes

- Voice recognition still depends on browser support, so Chrome/Edge remain the best local demo browsers.
- If the backend says the Copilot CLI is unavailable, update `COPILOT_COMMAND` or install/authenticate the CLI before running commands.
