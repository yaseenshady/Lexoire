# Lexoire

Lexoire is a local-first desktop workspace for voice-driven GitHub Copilot automation.

- **Frontend**: React + Vite interface for voice input, queued prompts, streaming responses, and workspace context
- **Backend**: Express + Socket.IO runtime for Copilot orchestration, persistence, and provider integrations
- **Desktop shell**: Electron app with native speech recognition and system TTS on macOS
- **Persistence**: SQLite-backed conversations, memories, and execution-plan state

## Highlights

- Voice and text command entry
- Streaming assistant responses
- Multi-provider orchestration for Copilot, Claude, and Codex
- Local persistence for sessions, memories, and project state
- Desktop packaging with Electron

## Requirements

- **Node.js** 22+
- **npm** 10+
- A working **GitHub Copilot CLI** install (`copilot`) authenticated for local use
- **macOS** for the full packaged desktop speech experience
- A Chromium-based browser for the best browser speech API support in development

## Quick start

```bash
npm run install:all
npm run dev
```

That starts:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

For a packaged local desktop build:

```bash
npm run electron:pack:local
```

## Build and run

Production-style local run:

```bash
npm run build
npm start
```

Electron desktop app in development:

```bash
npm run electron:dev
```

## Configuration

Copy and edit the example files if needed:

- `backend/.env.example`
- `frontend/.env.example`

Important backend settings:

- `PORT`
- `DB_PATH`
- `FRONTEND_ORIGIN`
- `COPILOT_COMMAND`

Optional frontend setting:

- `VITE_API_URL`

## Project structure

```text
frontend/   React + Vite UI
backend/    Express + Socket.IO runtime
electron/   Desktop shell and native integrations
shared/     Shared TypeScript types
swift/      Native macOS speech-recognition helper
website/    Public website and docs site
docs/       Contributor and release documentation
```

## Documentation

- `docs/getting-started.md`
- `docs/development.md`
- `docs/architecture.md`
- `CHANGELOG.md`
- `SECURITY.md`

## Website deployment

The public site lives in `website/` and is published with `.github/workflows/deploy-site.yml`.

For public deploys, keep download links pointed at the GitHub Releases page unless the exact asset names for the current release are confirmed.

## Open-source release notes

Lexoire is released under the **MIT License**.

If you want to publish a true open-source release, keep the license commercially usable. Noncommercial restrictions are **not** open source under the OSI definition.

## Contributing

See `CONTRIBUTING.md` for development workflow, pull request expectations, and validation guidance.
