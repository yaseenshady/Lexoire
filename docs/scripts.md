# Shell Scripts

Three helper shell scripts live in the repository root. They are not part of the npm build pipeline — they are convenience wrappers for the most common developer and end-user entry points.

---

## `install.sh` — one-line release installer

```bash
curl -fsSL https://raw.githubusercontent.com/yaseenshady/Lexoire/main/install.sh | bash
```

Downloads the latest GitHub Release asset for the current platform and architecture, then prints install instructions.

### What it does

1. Queries the GitHub Releases API for the latest release asset URLs.
2. Picks the right asset based on `uname -s` / `uname -m`:

| Platform | Asset picked |
|---|---|
| macOS Apple Silicon (`arm64`) | `arm64` or `universal` `.dmg`, falling back to any `.dmg` |
| macOS Intel (`x86_64`) | `x64` or `universal` `.dmg`, falling back to any `.dmg` |
| Linux | `.AppImage`, falling back to `.deb` |
| Windows (Git Bash / MSYS) | `-setup.exe`, falling back to any `.exe` |

3. Downloads the asset to `~/Downloads/` with a progress bar.
4. Prints next-step instructions for the downloaded file type:
   - **DMG** — open and drag to `/Applications`
   - **AppImage** — `chmod +x` applied automatically; run directly
   - **DEB** — `sudo dpkg -i <file>`
   - **EXE** — run the installer

### Prerequisites

- `curl` must be available (the script exits early with a manual-download URL if not).
- Internet access to `api.github.com` and `github.com`.

### Manual alternative

If the one-liner is unavailable, open the releases page directly:

```
https://github.com/yaseenshady/Lexoire/releases/latest
```

---

## `start.sh` — development quick-start

```bash
./start.sh
```

Boots the full development stack (frontend + backend) after performing pre-flight checks.

### What it does

1. Verifies `gh` (GitHub CLI) is installed — exits with install instructions if not.
2. Verifies the `gh copilot` extension is installed — exits with install instructions if not.
3. Runs `npm run install:all` if `frontend/node_modules` or `backend/node_modules` are absent.
4. Prints the development URLs:
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:5000`
5. Runs `npm run dev` (concurrently starts the Vite dev server and the backend with hot-reload).

### Prerequisites

- Node.js 22+ and npm 10+.
- GitHub CLI (`gh`) with the Copilot extension (`gh extension install github/gh-copilot`).
- `backend/.env` configured (copy from `backend/.env.example`).

### Equivalent npm command

```bash
npm run dev
```

`start.sh` adds the CLI pre-flight checks; the npm script does not.

---

## `start-electron.sh` — Electron desktop quick-start

```bash
./start-electron.sh
```

Builds the project (if needed) and launches the Electron desktop app.

### What it does

1. Changes directory to the repository root (so it can be called from anywhere).
2. Runs `npm run build` if `backend/dist/` is absent.
3. Runs `npm run build` if `frontend/dist/` is absent.
4. Launches the Electron shell via `npm run electron`.

### Prerequisites

- Node.js 22+ and npm 10+.
- On macOS: Xcode command-line tools for the Swift speech helper build step.
- On Windows/Linux: the local Whisper model must be downloaded first (`npm run speech:model:prepare`).

### Equivalent npm command

```bash
npm run electron:dev
```

`start-electron.sh` skips the build if `dist/` folders already exist; `electron:dev` always rebuilds.
