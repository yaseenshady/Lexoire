# LEXOIRE

A local-first desktop assistant that lets you control GitHub Copilot, Claude, and Codex by voice or text. Speak a prompt, watch the response stream in, and hear it read back — all running on your machine.

## What it does

- **Voice-first** — speak commands; LEXOIRE transcribes, routes, and responds
- **Three AI agents** — Copilot (GitHub), Claude (Anthropic), and Codex, each with their own streaming chat panel
- **Barge-in** — hit the Silence button to stop LEXOIRE mid-sentence and issue a new command
- **Queued prompts** — chain commands and let them run sequentially while you work
- **Workspace sessions** — associate prompts with a git repo and objective; context follows each session
- **Persistent memory** — SQLite-backed conversations, notes, and project plans survive restarts
- **Local speech** — macOS uses native speech recognition; Windows/Linux fall back to a bundled Whisper model with no paid API required

## Stack

| Layer | Technology |
|---|---|
| UI | React + Vite |
| Backend | Express + Socket.IO |
| Desktop shell | Electron 41 |
| Native speech (macOS) | Swift helper (`LexoireSpeech`) |
| Fallback speech | Whisper via `@huggingface/transformers` |
| Database | SQLite via `better-sqlite3` |

## Requirements

- **Node.js** 22+, **npm** 10+
- **GitHub Copilot CLI** (`copilot`) — authenticated and working (`copilot --version`)
- **Claude CLI** (`claude`) — for Claude agent support
- **Codex CLI** (`codex`) — for Codex agent support
- macOS for native packaged speech; any platform for dev mode with browser speech APIs

## Quick start

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure the backend (copy and edit as needed)
cp backend/.env.example backend/.env

# 3. Start frontend + backend in parallel
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:7337`

## Configuration

`backend/.env` key settings:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `7337` | Backend HTTP port |
| `DB_PATH` | `./lexoire.db` | SQLite database location |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin |
| `COPILOT_COMMAND` | `copilot` | Path to Copilot CLI binary |
| `CLAUDE_COMMAND` | *(auto-detected)* | Path to Claude CLI binary |
| `CODEX_COMMAND` | *(auto-detected)* | Path to Codex CLI binary |
| `ANTHROPIC_API_KEY` | — | Required only if Claude CLI is unavailable |
| `ELEVENLABS_API_KEY` | — | Optional: higher-quality TTS voices |
| `LEXOIRE_LOCAL_STT_MODEL` | `Xenova/whisper-base.en` | Whisper model for Windows/Linux speech |

Optional frontend setting (`frontend/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Override backend URL in dev |

## Desktop app

Build and run as a native Electron desktop app:

```bash
# Development (builds then launches Electron)
npm run electron:dev

# Production build for macOS (outputs to dist/)
npm run electron:build:mac

# Unsigned local package (for testing without code signing)
npm run electron:pack:local
```

The build pipeline:
1. Compiles the Swift speech helper (macOS only)
2. Downloads and caches the Whisper model
3. Builds the frontend and backend
4. Rebuilds native modules (`better-sqlite3`, `onnxruntime-node`) for the Electron ABI
5. Packages everything with `electron-builder`

## Project structure

```
frontend/   React + Vite UI
backend/    Express + Socket.IO API server
electron/   Desktop shell and native integrations
swift/      Native macOS speech recognition helper
docs/       Architecture, development, and getting-started guides
```

## Docs

- [`docs/getting-started.md`](docs/getting-started.md)
- [`docs/development.md`](docs/development.md)
- [`docs/architecture.md`](docs/architecture.md)

## License

MIT
