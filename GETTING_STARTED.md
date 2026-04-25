# Getting Started with JARVIS

Welcome to JARVIS — an AI-powered voice automation system for orchestrating GitHub Copilot sessions with a futuristic glassmorphism UI.

## Quick Start: Open the App

### Option 1: Electron App (Recommended)
One-command launch with native app window:

```bash
cd /Users/yshady/Documents/jarvis
npm run electron
```

The app will:
- Build frontend & backend automatically
- Start the backend on port 5002
- Launch an Electron window with JARVIS UI
- Display the AI core animation with orbital rings and particles

**App Icon:** `/Users/yshady/Documents/jarvis/electron/assets/icon.png`

### Option 2: Browser
Run dev server and open in browser:

```bash
cd /Users/yshady/Documents/jarvis
npm run dev
```

Then open: **http://localhost:3000**

### Option 3: Production Build
Build and run as integrated server:

```bash
cd /Users/yshady/Documents/jarvis
npm run build
npm start
```

Then open: **http://localhost:5001**

## What You'll See

When you launch JARVIS:

1. **Futuristic AI Core** - A glowing holographic sphere with:
   - Pulsing cyan/blue/violet glow from center
   - Rotating latitude/longitude lines
   - 3 orbital rings rotating at different speeds
   - 16-24 data particles traveling as "packets"
   - Micro-dots with connection lines
   - Holographic HUD annotations

2. **Voice Controls**
   - Press **CTRL + Space** to start listening
   - Speak naturally: "List my sessions" or "Resume feature branch"
   - JARVIS responds with voice synthesis and terminal output

3. **Dashboard Elements**
   - **Status Bar** - Shows connection, listening state, session info
   - **Conversation Panel** - Chat history with user/assistant messages
   - **Memory Panel** - Searchable extracted memories from conversations
   - **Project Plan** - Steps and progress of current task
   - **Terminal Output** - Real-time Copilot CLI execution

4. **Settings**
   - **Voice Character** - Select natural voice (Flo, Eddy, etc.)
   - **Speech Pace** - Control playback speed (0.8x–1.05x)
   - **Session Management** - View and resume Copilot sessions

## Key Hotkeys

| Hotkey | Action |
|--------|--------|
| `CTRL + Space` | Start voice listening |
| `CTRL + ,` | Open settings |
| `ESC` | Abort current action |
| `CTRL + Q` (Electron) | Quit app |

## Architecture

```
Frontend (React + Vite)
    ↓ (Socket.IO)
Backend (Express + SQLite)
    ↓
Copilot CLI (`copilot` binary)
    ↓
GitHub Copilot Sessions
```

- **Frontend**: Voice input, UI display, command entry
- **Backend**: Socket.IO relay, Copilot execution, session persistence
- **Database**: SQLite stores conversations, memories, project plans
- **Sessions**: Each Copilot session is resumable with `copilot --resume <SESSION_ID>`

## Development

### Install Dependencies
```bash
npm run install:all
```

### Development Mode (with hot reload)
```bash
npm run dev
```

This starts:
- Frontend: http://localhost:3000 (Vite dev server)
- Backend: http://localhost:5000 (Express)

### Build for Production
```bash
npm run build
```

Outputs:
- `frontend/dist/` - Compiled React app
- `backend/dist/` - Compiled Node.js server

### Build Packaged Apps
```bash
npm run electron:build:mac     # macOS .app bundle
npm run electron:build:win     # Windows .exe
npm run electron:dist          # All platforms
```

## File Structure

```
jarvis/
├── frontend/                  # React UI
│   ├── src/
│   │   ├── components/       # UI components (VoiceOrb, JarvisSphere, etc.)
│   │   ├── hooks/            # Custom hooks (voice, socket, speech)
│   │   ├── services/         # API utilities
│   │   └── styles/           # Tailwind + glow effects
│   ├── vite.config.ts        # Vite build config
│   └── package.json
│
├── backend/                   # Node.js server
│   ├── src/
│   │   ├── server.ts         # Express + Socket.IO setup
│   │   ├── copilot/          # Copilot CLI wrapper
│   │   ├── db/               # SQLite persistence
│   │   └── services/         # Utilities (logging, etc.)
│   ├── tsconfig.json
│   └── package.json
│
├── electron/                  # Electron wrapper
│   ├── main.js               # App entry point
│   ├── preload.js            # IPC bridge
│   ├── assets/               # App icons
│   └── build-config.json     # Electron builder config
│
├── shared/                    # Shared types
│   └── types.ts
│
├── package.json              # Root workspace
├── README.md                 # Project overview
├── CONTRIBUTING.md           # Contributing guide
├── FLEET_MODE_GUIDE.md       # This guide (fleet mode documentation)
├── JARVIS_SPHERE_DOCS.md     # AI core animation component docs
└── LICENSE                   # MIT License
```

## Core Components

### JarvisSphere
Premium holographic AI core animation with state-driven visuals.

```tsx
import JarvisSphere from '@/components/JarvisSphere';

<JarvisSphere 
  state="thinking"      // 'idle' | 'thinking' | 'success' | 'error'
  size={240}            // Pixel size
  accent="cyan"         // 'cyan' | 'blue' | 'violet' | 'amber'
/>
```

See `JARVIS_SPHERE_DOCS.md` for full documentation.

### VoiceOrb
Voice recognition visualization and listening indicator.

### ConversationPanel
Chat history display with user/assistant messages.

### MemoryPanel
Searchable extracted memories from conversations.

### ProjectPlanViewer
Visual display of current project plan steps.

### SettingsPanel
User preferences (voice character, speech pace, etc.)

## Configuration

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000
```

### Backend (.env)
```
PORT=5000
NODE_ENV=development
DB_PATH=./jarvis.db
FRONTEND_ORIGIN=http://localhost:3000
COPILOT_COMMAND=copilot
```

## Troubleshooting

### "Speech output is not supported"
- Browser doesn't support Web Speech API
- Fallback to backend `say` command (macOS) or system TTS
- Try Chrome/Edge (best support)

### "Copilot CLI not found"
- Ensure GitHub Copilot CLI is installed
- Check: `which copilot`
- Install: `npm install -g @github/copilot-cli`

### Backend won't start
- Check if port is in use: `lsof -i :5000`
- App auto-discovers ports 5000-5005
- Or set `PORT` environment variable

### Voice not working
- Enable microphone access in browser
- Try Chrome/Edge (Safari may have limitations)
- Check DevTools console for errors

## Development Workflow

When making changes:

1. **Frontend changes** - Auto-reload via Vite HMR
2. **Backend changes** - Restart backend (npm run dev in new terminal)
3. **Database changes** - DB auto-creates schema on startup
4. **Build & test** - `npm run build` then `npm start`

## Next Steps

- 🎤 Start listening: `CTRL + Space`
- 📝 Check memories: Open Memory panel
- 🗂️ View plan: Open Project Plan panel
- ⚙️ Adjust voice: CTRL + , → Settings → Voice Character

## Fleet Mode Development

For coordinating complex development work:

See `FLEET_MODE_GUIDE.md` for:
- Planning framework
- Todo decomposition
- Parallel sub-agent dispatch
- Dependency management
- SQL-based progress tracking

This is the recommended workflow for JARVIS development and evolution.

## License

JARVIS is open source under the MIT License. See LICENSE file for details.

---

**Questions?** Check the docs or open an issue on GitHub.

Happy automating! 🚀
