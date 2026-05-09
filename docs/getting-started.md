# Getting Started

## Requirements

- Node.js 22+
- npm 10+
- GitHub Copilot CLI installed and authenticated
- macOS if you want the native packaged desktop speech-recognition path
- Enough disk space for the local Whisper speech model prepared for Windows/Linux desktop voice input

## Install

```bash
npm run install:all
```

## Run the web app

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## Run the Electron desktop app

```bash
npm run electron:dev
```

## Production-style local run

```bash
npm run build
npm start
```

## Package the desktop app

### Quick local package (unsigned, any platform)

```bash
npm run electron:pack:local
```

Produces an unpacked `.app` / `.exe` / Linux binary in `dist/` — no installer, no code signing. Useful for a quick local test of the packaged app.

### macOS installer

```bash
npm run electron:release:mac
```

Outputs a **DMG** and a **ZIP** to `dist/`. Code signing is disabled automatically (`identity=null`), so no Apple Developer certificate is required.

### Windows installer

```bash
npm run electron:release:win
```

Outputs an **NSIS setup `.exe`** (with install directory picker) and a **portable `.exe`** to `dist/`, both targeting x64.

### Linux installer

```bash
npm run electron:release:linux
```

Outputs an **AppImage** and a **`.deb`** package to `dist/`, both targeting x64.

### All platforms at once

```bash
npm run electron:build:all
```

Cross-compilation works on the same machine only when all required native tool-chains are present. For reliable multi-platform builds, run each platform command on its own OS, or use a CI matrix.

### Output naming

All installer files follow the pattern:

```
LEXOIRE-{version}-{os}-{arch}.{ext}
```

e.g. `LEXOIRE-1.1.0-mac-arm64.dmg`, `LEXOIRE-1.1.0-win-x64-setup.exe`, `LEXOIRE-1.1.0-linux-x64.AppImage`

## Environment configuration

Copy and edit:

- `backend/.env.example`
- `frontend/.env.example`

## Common setup issues

- If Copilot orchestration is unavailable, verify `COPILOT_COMMAND` points to a working `copilot` binary.
- If browser voice input fails, use a Chromium-based browser and confirm microphone permissions.
- If the desktop app lacks speech features on macOS, verify microphone and speech-recognition permissions.
- If packaged voice input on Windows/Linux is unavailable, rebuild with `npm run speech:model:prepare` so the local speech model is present.
