# JARVIS Electron App

JARVIS packaged as a standalone Electron desktop application for macOS and Windows.

## Features

- ✅ Bundled Electron app with integrated backend and frontend
- ✅ Automatic backend startup when app launches
- ✅ Frontend served from local backend server
- ✅ Standalone executable (no external server required)
- ✅ Cross-platform builds (macOS and Windows)
- ✅ App icon and branding

## Building the App

### Development

Run the app in development mode:

```bash
npm run electron:dev
```

This builds the frontend and backend, then starts the Electron app with dev tools enabled.

### Production Build

Create a distributable app for your platform:

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Auto-detect platform
npm run electron:build
```

The built apps will be in the `dist/` directory.

## Application Structure

- `electron/main.js` - Electron main process, handles backend startup and window creation
- `electron/preload.js` - Preload script for IPC communication (security boundary)
- `electron/assets/` - App icons and branding
- `backend/dist/` - Compiled backend server
- `frontend/dist/` - Built React frontend

## How It Works

1. **Startup**: When the app starts, `main.js` launches the Node.js backend server
2. **Port Discovery**: The backend automatically finds an available port starting from 5000
3. **Frontend Loading**: The Electron window loads `http://localhost:{port}` from the backend
4. **Server**: The backend Express server serves the built React frontend and handles all API requests

## Configuration

The build configuration is defined in `package.json`:

- **appId**: `com.jarvis.voice-automation`
- **productName**: `JARVIS`
- **Supported Platforms**:
  - macOS: DMG, ZIP archives
  - Windows: NSIS installer, Portable executable

## File Includes

The build automatically includes:
- `electron/` - Main process and IPC handlers
- `backend/dist/` - Compiled backend
- `frontend/dist/` - Built frontend
- `node_modules/` - Dependencies (pruned during build)

## Development Notes

- The app always starts the backend server, even in development mode
- Dev tools are enabled when running `npm run electron` or `npm run electron:dev`
- The frontend is served at runtime from the backend, not embedded in the app package
- The backend can be accessed at `http://localhost:{port}` from the app window

## Troubleshooting

**Port Already in Use**: If port 5000 is busy, the backend automatically falls back to ports 5001, 5002, etc.

**Build Fails**: Ensure both frontend and backend build successfully:
```bash
npm run build
```

**App Won't Start**: Check the logs:
- macOS: Console.app search for "JARVIS"
- Windows: Check Windows Event Viewer
