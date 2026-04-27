# Architecture

Lexoire is a local-first orchestration stack with four main layers.

## Frontend

The React + Vite frontend handles:

- voice/text input
- response rendering
- queue state
- session and workspace controls
- Socket.IO connectivity

## Backend

The Express + Socket.IO backend handles:

- command dispatch
- Copilot/Claude/Codex provider integration
- conversation persistence
- memory derivation
- app-state APIs
- backend local Whisper transcription fallback for non-macOS desktop speech input

## Electron shell

The Electron layer:

- launches the backend for packaged desktop use
- hosts the desktop window
- bridges native speech/TTS capabilities
- falls back to backend local-model transcription when native desktop speech recognition is unavailable
- manages app packaging behavior

## Native speech helper

`swift/LexoireSpeech.swift` provides the macOS speech-recognition helper used by the Electron app.

## Persistence model

SQLite stores:

- conversations
- derived memories
- project-plan state

## Runtime flow

1. The user submits a voice or text prompt.
2. The frontend emits work over Socket.IO.
3. The backend routes to the selected provider.
4. Streaming output is returned to the frontend.
5. The conversation and derived state are persisted locally.
