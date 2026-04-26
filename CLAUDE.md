# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Run frontend + backend together (hot-reload)
npm run dev

# Individual services
npm run dev:frontend    # Vite on http://localhost:5173
npm run dev:backend     # nodemon/ts-node on http://localhost:5000 (auto-scans 5000-5005)

# Build for production
npm run build           # frontend/dist + backend/dist

# Electron desktop app
npm run electron        # Launch Electron (uses existing build)
npm run electron:dev    # Build then launch
npm run electron:build:mac  # Package macOS DMG
```

**Backend only:** `cd backend && npm run dev` (nodemon + ts-node, no separate compile step needed)

## Architecture

JARVIS is a voice-driven AI automation system with three processes: a Vite/React frontend, an Express/Socket.IO backend, and an Electron shell.

### Process Communication

```
Electron main.js
  └─ spawns backend/dist/server.js on PORT=7337 (hardcoded in main.js)
  └─ opens BrowserWindow → loads frontend (dev: localhost:5173, prod: frontend/dist)

Frontend (React)
  └─ Socket.IO client → backend
  └─ window.jarvis IPC (Electron only) → preload.js → ipcMain → Swift speech bridge

Backend (Express + Socket.IO)
  └─ CopilotService → spawns `gh copilot` CLI subprocess
  └─ SessionManager → SQLite (jarvis.db) via better-sqlite3
  └─ SessionMessaging → inter-session messages/context in SQLite
```

### Key Entry Points

- **Frontend root:** `frontend/src/AppClean.tsx` — `App.tsx` is just a re-export of `AppClean`
- **Backend root:** `backend/src/server.ts` — all routes and Socket.IO handlers in one file
- **Electron:** `electron/main.js` — starts backend subprocess, creates BrowserWindow; `electron/preload.js` — exposes `window.jarvis` IPC bridge

### Backend Services

| File | Responsibility |
|------|---------------|
| `backend/src/db/database.ts` | SQLite wrapper (better-sqlite3); auto-creates schema on first run |
| `backend/src/services/session-manager.ts` | Session CRUD, status transitions (idle/active/thinking/paused), focus level |
| `backend/src/services/session-messaging.ts` | Inter-session messages and context sharing |
| `backend/src/services/session-persistence.ts` | Session archiving and history |
| `backend/src/copilot/copilot-service.ts` | Spawns `gh copilot` CLI; tracks master session ID for resuming |
| `backend/src/services/academic-ppt-service.ts` | Proxy to a separate academic PPT microservice |

### Frontend Hooks

| Hook | Purpose |
|------|---------|
| `useSocket` | Socket.IO connection management |
| `useVoiceRecognition` | Web Speech API with silence detection |
| `useVoiceRouting` | Combines voice recognition + session router |
| `useSessionRouter` | Parses voice commands to route to specific sessions |
| `useSessionOrchestrator` | Higher-level multi-session coordination |
| `useSpeechSynthesis` | TTS via Web Speech API or Electron IPC |

### Socket.IO Event Contract

Voice commands auto-send after 1800ms silence (`SILENCE_MS` in `AppClean.tsx`). Frontend emits:
- `copilot:prompt` → backend executes via `CopilotService`, responds with `command:response`
- `db:command` (`status` | `new_session` | `list_sessions`) → responds with `command:response`
- `session:create`, `session:switch`, `session:pause`, `session:resume`, `session:close`
- `copilot:execute` → streams `copilot:output` chunks, ends with `copilot:complete`

Backend broadcasts to all clients: `session:created`, `session:switched`, `session:status-changed`, `session:message`, `plan:update`, `memory:results`

### Voice / TTS Pipeline

In Electron: Swift `SFSpeechRecognizer` → `preload.js` IPC → `window.jarvis.onSpeech()` → `AppClean.tsx` for recognition; `window.jarvis.speak()` → IPC → macOS `say` command for TTS.

In browser-only mode: Web Speech API for recognition, `window.speechSynthesis` for TTS. Backend also has a `POST /api/speak` endpoint that calls `say -v "Alex"` directly.

### Port Handling

- Electron hardcodes `PORT=7337` when spawning the backend
- Dev mode backend starts at 5000 and auto-scans up to 5005 if busy (`findAvailablePort` in `server.ts`)
- Frontend connects to `window.location.origin` so same-origin prod mode works when backend serves `frontend/dist`

### Database Schema (SQLite — `backend/jarvis.db`)

Tables: `conversations`, `messages`, `memories`, `project_plans`, `project_steps`, `sessions`, `session_archive`, `session_history`, `session_messages`, `session_context_shares`

Schema is auto-created by `DatabaseService` on first connection — no migration tooling.

## TypeScript

- Backend: strict mode, `ts-node` for dev, `tsc` for build → `backend/dist/`
- Frontend: Vite handles transpilation; `tsc` for type-checking only (`tsconfig.json`)
- Shared types live in `shared/types.ts` and are duplicated into `backend/src/types.ts` and `frontend/src/types.ts`
- There is a stale duplicate `backend/src/types 2.ts` — ignore it

## Electron Notes

- `electron/main.js` forces `arch -arm64` when spawning the backend (Apple Silicon fix)
- `preload.js` exposes `window.jarvis` with `startSpeech`, `stopSpeechRecognition`, `speak`, `onSpeech`
- Swift speech recognition is in `swift/JarvisSpeech.swift` — compiled separately, called via IPC
