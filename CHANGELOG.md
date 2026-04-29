# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0 - 2026-04-29

### Added

- GitHub nav link across all website pages
- Changelog page on the website
- Multi-session support: all three providers (Claude, Copilot, Codex) can now run concurrent sessions without blocking each other
- Codex: removed busy guard so multiple prompts spawn independent process slots
- Interrupt button now cancels TTS queue and immediately resumes mic

### Changed

- TTS: full response is now passed as a single utterance to the speech engine, eliminating inter-sentence startup gaps and pauses
- Native TTS char cap raised from 400 to 3000 to support longer responses without truncation
- TTS markdown stripper extended to handle code fences, tables, links, and bullet noise
- Codex streaming status label changed from "Streaming · N chars" to "Working"
- Mobile nav: full-width dropdown with solid background, 44px tap targets on all links
- Mobile hero: typing animation disabled on small screens, action links get proper touch zones

### Fixed

- Mic goes stale after TTS — now force-restarts after playback
- Interim speech lost when TTS starts — cached and restored after playback
- Multi-window mic conflict — only the active window owns the speech recognizer
- Speech recognition broken after ownership changes — ownership drift now detected and corrected

## 1.0.0 - 2026-04-26

### Added

- Public release docs in `docs/`
- `SECURITY.md`
- Example environment files for frontend and backend
- Basic CI workflow for build verification

### Changed

- Standardized package metadata on the MIT license
- Updated public-facing branding to Lexoire in release-critical files
- Simplified the root documentation layout for public release

### Removed

- Tracked internal session-history files
- Tracked generated database WAL/SHM artifacts
- Tracked compiled Swift binary from source control
