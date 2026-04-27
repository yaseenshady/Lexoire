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

```bash
npm run electron:pack:local
```

## Environment configuration

Copy and edit:

- `backend/.env.example`
- `frontend/.env.example`

## Common setup issues

- If Copilot orchestration is unavailable, verify `COPILOT_COMMAND` points to a working `copilot` binary.
- If browser voice input fails, use a Chromium-based browser and confirm microphone permissions.
- If the desktop app lacks speech features on macOS, verify microphone and speech-recognition permissions.
- If packaged voice input on Windows/Linux is unavailable, rebuild with `npm run speech:model:prepare` so the local speech model is present.
