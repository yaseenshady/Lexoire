# JARVIS Current Delivery Summary

JARVIS is now delivered as a **coherent local app** instead of separate demo pieces.

## Included

- React frontend with voice input, terminal streaming, memories, and project-plan views
- Express + Socket.IO backend with Copilot CLI execution
- SQLite persistence for conversations, derived memories, and execution plans
- Root scripts for install, dev, build, and start
- Production-style single-process serving after `npm run build`

## Important runtime behavior

1. The frontend hydrates from `/api/app-state`.
2. Active conversations sync to SQLite when conversation memory is enabled.
3. Memories are generated automatically from recent saved messages.
4. Command execution streams live output and updates the latest execution plan.
5. `npm start` serves both the API and the built frontend bundle.

See `README.md` for the full explanation and `QUICKSTART.md` for the shortest path to running it.
