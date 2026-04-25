# JARVIS Quick Start

## Start the project

```bash
npm run install:all
npm run dev
```

Open `http://localhost:3000`.

## What you should see

1. **Status bar** shows connection state, memory counts, and whether the Copilot CLI is available.
2. **Conversation view** shows prompts and completion summaries.
3. **Memories view** shows searchable SQLite-backed memory entries derived from saved conversations.
4. **Project Plan view** shows the latest execution pipeline for a command.
5. **Terminal output** streams the live backend output for the running command.

## Typical flow

1. Type a command or use voice input.
2. JARVIS sends it to the backend through Socket.IO.
3. The backend runs the Copilot CLI and streams output back.
4. The frontend syncs the active conversation to SQLite.
5. The backend regenerates memories and updates the execution plan.

## Important settings

Open the settings panel with `Ctrl/Cmd + ,`.

- **App Endpoint**: frontend/app origin to connect to
- **Sync conversation memory**: enables backend conversation + memory persistence
- **Continuous voice capture**: keeps speech recognition active until you stop it
- **Speak assistant responses**: reads responses aloud when supported

## Production-style run

```bash
npm run build
npm start
```

That serves the compiled frontend from the backend, so the whole app runs from one process.

## Troubleshooting

### Backend unavailable

- Make sure `npm run dev:backend` is running on port `5000`
- Confirm the frontend endpoint points at the correct app origin

### Copilot CLI unavailable

- Check `backend/.env`
- Verify the configured command exists:

```bash
copilot --version
```

If you use a different CLI entry, update `COPILOT_COMMAND`.

### No memories appear

- Make sure **Sync conversation memory** is enabled
- Run at least one command so the active conversation is saved to SQLite
