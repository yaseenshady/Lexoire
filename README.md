# Lexoire

Lexoire is a local-first desktop workspace for voice-driven GitHub Copilot automation.

- **Frontend**: React + Vite interface for voice input, queued prompts, streaming responses, and workspace context
- **Backend**: Express + Socket.IO runtime for Copilot orchestration, persistence, and provider integrations
- **Desktop shell**: Electron app with native macOS speech recognition, cross-platform system TTS, and a bundled free local Whisper fallback for Windows/Linux
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
- **macOS** for the native packaged desktop speech-recognition path
- Enough disk space for the bundled/local Whisper speech model used on Windows/Linux
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
- `LEXOIRE_LOCAL_STT_MODEL` to override the local Whisper-compatible speech model

The desktop build now prepares a **fully local** speech-recognition model during `npm run build`, and packaged Windows/Linux apps use that local model without any paid API dependency.

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

The install buttons on the site resolve the latest matching desktop release asset from GitHub Releases at runtime and fall back to the generic releases page if no platform asset is available yet.

## Desktop releases

Desktop release artifacts are published with `.github/workflows/release-desktop.yml`.

- Push a tag like `v1.0.0` to build and publish macOS, Windows, and Linux artifacts.
- Or run the workflow manually to build from the current commit and create/update the matching GitHub release.
- The release workflow publishes platform assets for the site install buttons to consume:
  - macOS: `dmg`, `zip`
  - Windows: `nsis`, `portable`
  - Linux: `AppImage`, `deb`

## Open-source release notes

Lexoire is released under the **MIT License**.

If you want to publish a true open-source release, keep the license commercially usable. Noncommercial restrictions are **not** open source under the OSI definition.

## Contributing

See `CONTRIBUTING.md` for development workflow, pull request expectations, and validation guidance.
