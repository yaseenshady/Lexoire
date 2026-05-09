# Development

## Requirements

- **Node.js** 22+ and **npm** 10+
- At least one CLI agent installed and authenticated:
  - [`claude`](https://github.com/anthropics/claude-code) — Claude CLI
  - [`copilot`](https://docs.github.com/en/copilot/github-copilot-in-the-cli) — GitHub Copilot CLI
  - [`codex`](https://github.com/openai/codex) — Codex CLI

## Scripts

From the repository root:

```bash
npm run install:all      # install all workspace dependencies
npm run dev              # frontend + backend with hot reload
npm run dev:frontend     # Vite frontend only
npm run dev:backend      # backend with nodemon + ts-node
npm run build            # production build (frontend + backend + Swift helper)
npm run electron:dev     # build then launch Electron
npm run electron:pack:local  # unsigned local Electron package
```

Default development URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## Environment configuration

Copy and fill in the backend environment file before first run:

```bash
cp backend/.env.example backend/.env
```

Key variables in `backend/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Backend HTTP port |
| `DB_PATH` | `./lexoire.db` | SQLite database location |
| `COPILOT_COMMAND` | `copilot` | Path to Copilot CLI binary |
| `CLAUDE_COMMAND` | *(auto)* | Path to Claude CLI binary |
| `CODEX_COMMAND` | *(auto)* | Path to Codex CLI binary |
| `ANTHROPIC_API_KEY` | — | Only needed if Claude CLI is unavailable |
| `ELEVENLABS_API_KEY` | — | Optional higher-quality TTS |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin |

## Repository layout

- `frontend/` - React + Vite interface
- `backend/` - Express + Socket.IO runtime
- `electron/` - desktop shell and native IPC bridge
- `shared/` - shared TypeScript types
- `swift/` - macOS native speech helper (`LexoireSpeech`)
- `website/` - static GitHub Pages marketing and docs site
- `docs/` - architecture and developer guides
- `scripts/` - build helper scripts

## Common issues

| Issue | Fix |
|---|---|
| Voice input not working | Use a Chromium-based browser and confirm microphone permissions |
| Backend not responding | Confirm `npm run dev:backend` is running and PORT is not in use |
| Copilot commands fail | Verify `COPILOT_COMMAND` in `backend/.env` points to a working `copilot` binary |
| Desktop speech missing (macOS) | Grant microphone and speech-recognition permissions in System Settings |
| Desktop speech missing (Windows/Linux) | Run `npm run speech:model:prepare` to download the local Whisper model |
| Electron window blank | Open DevTools (Cmd+Opt+I / Ctrl+Shift+I) and check the console for errors |

## Validation

Before opening a pull request:

1. Run `npm run build`
2. Verify the changed flow locally
3. Update docs if user-facing behavior changed
4. Note platform-specific caveats in the PR description

## Release hygiene

- Do not commit generated binaries, local databases, or environment files
- Keep root docs minimal and move deep guides into `docs/`
- Preserve MIT license compatibility in contributed code
