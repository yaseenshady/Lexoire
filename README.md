<div align="center">

```
██╗     ███████╗██╗  ██╗ ██████╗ ██╗██████╗ ███████╗
██║     ██╔════╝╚██╗██╔╝██╔═══██╗██║██╔══██╗██╔════╝
██║     █████╗   ╚███╔╝ ██║   ██║██║██████╔╝█████╗  
██║     ██╔══╝   ██╔██╗ ██║   ██║██║██╔══██╗██╔══╝  
███████╗███████╗██╔╝ ██╗╚██████╔╝██║██║  ██║███████╗
╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝╚═╝  ╚═╝╚══════╝
```

**Voice command infrastructure for CLI-native AI tools.**

[![License: MIT](https://img.shields.io/badge/License-MIT-39ff88.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/yaseensh/Lexoire?style=flat-square&color=39ff88&label=latest)](https://github.com/yaseensh/Lexoire/releases/latest)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-39ff88?style=flat-square)](https://github.com/yaseensh/Lexoire/releases/latest)
[![Node](https://img.shields.io/badge/node-22%2B-39ff88?style=flat-square)](https://nodejs.org)

[**Download**](https://github.com/yaseensh/Lexoire/releases/latest) · [**Website**](https://yaseensh.github.io/Lexoire) · [**Docs**](docs/) · [**Changelog**](CHANGELOG.md)

</div>

---

## Install

### One-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/yaseensh/Lexoire/main/install.sh | bash
```

Auto-detects your OS and downloads the right binary from the latest release.

### Manual download

| Platform | Download |
|---|---|
| **macOS** (Apple Silicon) | [DMG](https://github.com/yaseensh/Lexoire/releases/latest) |
| **Windows** | [Setup EXE](https://github.com/yaseensh/Lexoire/releases/latest) |
| **Linux** | [AppImage / DEB](https://github.com/yaseensh/Lexoire/releases/latest) |

### Run from source

```bash
# 1 — clone and install
git clone https://github.com/yaseensh/Lexoire.git
cd Lexoire
npm run install:all

# 2 — configure backend
cp backend/.env.example backend/.env

# 3 — launch (frontend + backend in parallel)
npm run dev
```

> Frontend → `http://localhost:3000` · Backend → `http://localhost:7337`

---

## What it does

Lexoire is a **voice-first desktop shell** that routes your spoken commands to Claude, GitHub Copilot, and Codex — all at the same time, with shared context, live session routing, and natural TTS output.

```
YOU: "refactor the auth module to use JWT"
     │
     ▼
┌─────────────────────────────────────────────┐
│  LEXOIRE VOICE LAYER                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  CLAUDE  │  │ COPILOT  │  │  CODEX   │  │
│  │ session  │  │ session  │  │ session  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│         shared context  ·  live TTS         │
└─────────────────────────────────────────────┘
     │
     ▼
LEXOIRE: "Done. Auth now uses RS256 JWT with refresh token rotation..."
```

### Features

- 🎙 **Voice-first** — speak commands; Lexoire transcribes, routes, and responds
- 🤖 **Three AI providers** — Claude, GitHub Copilot, and Codex with independent session slots
- 🔀 **Provider handoff** — switch models mid-task with zero context loss via shared markdown
- 🔊 **Natural TTS** — full response spoken as one utterance, no inter-sentence gaps
- ⚡ **Barge-in** — interrupt mid-sentence and issue a new command instantly
- 💾 **Persistent sessions** — SQLite-backed conversations survive restarts; Claude CLI uses `--resume`
- 🌐 **Cross-platform** — macOS native speech, Windows SAPI/WinRT, Linux espeak-ng/spd-say
- 🖥 **Multi-window** — open parallel sessions across workspaces; mic ownership is exclusive

---

## Stack

| Layer | Technology |
|---|---|
| UI | React + Vite |
| Backend | Express + Socket.IO |
| Desktop shell | Electron |
| Native speech (macOS) | Swift helper (`LexoireSpeech`) |
| Fallback speech | Whisper via `@huggingface/transformers` |
| Database | SQLite via `better-sqlite3` |

---

## Requirements

- **Node.js** 22+ and **npm** 10+
- At least one CLI agent installed and authenticated:
  - [`claude`](https://github.com/anthropics/claude-code) — Claude CLI
  - [`copilot`](https://docs.github.com/en/copilot/github-copilot-in-the-cli) — GitHub Copilot CLI
  - [`codex`](https://github.com/openai/codex) — Codex CLI

---

## Configuration

`backend/.env` key settings:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `7337` | Backend HTTP port |
| `DB_PATH` | `./lexoire.db` | SQLite database location |
| `COPILOT_COMMAND` | `copilot` | Path to Copilot CLI |
| `CLAUDE_COMMAND` | *(auto)* | Path to Claude CLI |
| `CODEX_COMMAND` | *(auto)* | Path to Codex CLI |
| `ANTHROPIC_API_KEY` | — | Only needed if Claude CLI unavailable |
| `ELEVENLABS_API_KEY` | — | Optional higher-quality TTS |

---

## Building the desktop app

```bash
# Development — build then launch Electron
npm run electron:dev

# Production build — macOS (outputs to dist/)
npm run electron:build:mac

# Unsigned local package (no code signing)
npm run electron:pack:local
```

The build pipeline: compiles the Swift speech helper → downloads Whisper model → builds frontend + backend → rebuilds native modules for Electron ABI → packages with electron-builder.

---

## Project structure

```
frontend/   React + Vite UI
backend/    Express + Socket.IO API
electron/   Desktop shell and native integrations
swift/      Native macOS speech recognition helper
website/    Marketing site (GitHub Pages)
docs/       Architecture and development guides
install.sh  One-line platform installer
```

---

## Contributing

PRs welcome. MIT licensed — fork freely.

```bash
git clone https://github.com/yaseensh/Lexoire.git
cd Lexoire && npm run install:all && npm run dev
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/development.md`](docs/development.md).

---

## License

MIT © [yaseensh](https://github.com/yaseensh)
