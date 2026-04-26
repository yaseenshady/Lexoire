# Copilot Instructions for JARVIS

## Project Overview
JARVIS is a voice-driven AI automation system that orchestrates multiple GitHub Copilot CLI sessions through a futuristic web/Electron interface. The system uses a local SQLite database to track sessions, conversations, and task management.

## Architecture Principles
- **Multi-session orchestrator**: Voice commands route to different Copilot sessions
- **Local-first**: All data stored in SQLite, no cloud dependencies
- **Fleet mode**: Sub-agents handle independent tasks in parallel
- **Session-based workers**: Each Copilot session is a resumable unit via `copilot --resume SESSION_ID`

## Key Technical Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + Socket.IO + SQLite + Copilot CLI
- **Electron**: Bundled desktop app with auto-backend launch
- **Voice**: Web Speech API (recognition) + system TTS (synthesis)

## File Structure
```
jarvis/
├── frontend/src/
│   ├── App.tsx / AppClean.tsx       # Main app entry
│   ├── components/                  # React components
│   ├── hooks/                       # Custom hooks (voice, socket, etc.)
│   └── styles/                      # Tailwind config
├── backend/src/
│   ├── server.ts                    # Express + Socket.IO server
│   ├── services/
│   │   ├── session-manager.ts       # Session CRUD + state management
│   │   └── copilot.ts              # Copilot CLI interaction
│   └── db/                          # SQLite database
├── electron/
│   ├── main.js                      # Electron entry, backend launcher
│   ├── preload.js                   # IPC bridge
│   └── assets/icon.png              # App icon
└── shared/                          # Shared types
```

## Database Schema
- **sessions**: id, name, copilot_session_id, status, objective, last_summary, created_at
- **conversations**: id, session_id, messages (JSON), created_at
- **memories**: id, session_id, key, value, created_at
- **tasks**: id, session_id, title, status, created_at

## Development Workflow
1. **Local Development**:
   ```bash
   npm run dev          # Start frontend on http://localhost:5173
   npm run backend:dev  # Start backend on http://localhost:5003
   npm run electron     # Launch Electron with auto-backend
   ```

2. **Building**:
   ```bash
   npm run build        # Frontend + backend production build
   npm run electron:build:mac  # Package macOS app
   ```

3. **Fleet Mode** (parallel sub-agents):
   ```
   Use /fleet to dispatch 4 concurrent agents for:
   - Independent research/exploration
   - Feature implementation
   - Testing & validation
   - Documentation updates
   ```

## Voice Command Patterns
- **Session management**: "create session [name]", "switch to [session]", "list sessions"
- **Task execution**: "tell [session] to [command]", "broadcast [command]"
- **Query**: "status", "list tasks", "what's my memory"

## Important Behaviors
- Copilot sessions are **durable** - use `copilot --resume SESSION_ID` to resume
- Web Speech API is browser-limited - backend TTS fallback via macOS `say` command
- Socket.IO events must register before emission or frontend won't receive
- SQLite auto-creates schema on first run
- Port discovery scans 5000-5005 with fallback logic

## Common Issues & Fixes
| Issue | Fix |
|-------|-----|
| Port 5000 occupied | Backend auto-discovers 5001-5005 |
| Voice not working | Check microphone permissions in browser |
| Backend not responding | Verify `npm run backend:dev` is running |
| Electron window blank | Check browser console (Cmd+Opt+I) for errors |
| Build fails | Run `npm ci` to reinstall dependencies |

## Code Standards
- **TypeScript strict mode**: No `any` types without justification
- **React hooks**: Use functional components, prefer custom hooks
- **Error handling**: Always provide user feedback via Socket.IO or Toast
- **Performance**: Memoize expensive computations, avoid re-renders
- **Testing**: Unit tests for services, integration tests for Socket.IO events

## Copilot CLI Integration
```javascript
// Resumable sessions
const { spawn } = require('child_process');
const proc = spawn('copilot', ['--resume', SESSION_ID, '--output-format', 'json']);
// Parse JSON output to extract session ID and results
```

## Session Lifecycle
1. **Create**: User voice command → emit `session:create` → backend saves to DB
2. **Resume**: `copilot --resume STORED_SESSION_ID` → agent continues work
3. **Pause**: Save current state to DB, keep session ID
4. **Archive**: Mark session as complete, preserve for history

## Deployment Checklist
- [ ] All TypeScript compiles without errors
- [ ] Frontend builds to `frontend/dist/`
- [ ] Backend builds to `backend/dist/`
- [ ] Electron app builds successfully
- [ ] Voice input/output tested
- [ ] Multi-session creation/switching works
- [ ] SQLite database persists across restarts
- [ ] GitHub Actions CI/CD passes
- [ ] Git history is clean with proper commit messages

## When to Use Fleet Mode
- **YES**: Independent feature branches, parallel testing, documentation
- **NO**: Sequential dependent tasks, database migrations, critical path fixes

---

**Last Updated**: 2026-04-25  
**Maintained By**: GitHub Copilot CLI  
**License**: MIT
