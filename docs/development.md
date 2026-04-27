# Development

## Scripts

From the repository root:

```bash
npm run install:all
npm run dev
npm run build
npm run electron:dev
npm run electron:pack:local
```

## Repository layout

- `frontend/` - React + Vite interface
- `backend/` - Express + Socket.IO runtime
- `electron/` - desktop shell and native IPC bridge
- `shared/` - shared types
- `swift/` - macOS speech helper
- `website/` - project website

## Validation

Before opening a pull request:

1. Run `npm run build`
2. Verify the changed flow locally
3. Update docs if user-facing behavior changed
4. Note platform-specific caveats in the PR description

## Release hygiene

- Do not commit generated binaries, local databases, or environment files
- Keep root docs minimal and move deep guides into `docs/`
- Preserve MIT license compatibility in contributed code
