# Contributing to Lexoire

Thanks for helping improve Lexoire.

## Before you start

1. Fork the repository.
2. Clone your fork.
3. Install dependencies:

```bash
npm run install:all
```

## Local development

Run the web app:

```bash
npm run dev
```

Run the Electron desktop app:

```bash
npm run electron:dev
```

Create a production build:

```bash
npm run build
```

## Project areas

- `frontend/` - React + Vite interface
- `backend/` - Express + Socket.IO runtime
- `electron/` - Desktop shell and native bridges
- `shared/` - Shared TypeScript types
- `swift/` - Native macOS speech helper
- `docs/` - Public contributor and architecture docs

## Pull requests

Please:

1. Keep changes focused.
2. Update docs when behavior changes.
3. Run the existing build before opening a PR.
4. Describe user impact and validation clearly.

## Commit style

Conventional commits are preferred:

- `feat:`
- `fix:`
- `docs:`
- `refactor:`
- `test:`
- `chore:`

## Quality bar

Before submitting:

- Run `npm run build`
- Verify the affected flow locally
- Check for obvious console/runtime errors
- Note platform-specific caveats, especially for voice features

## License

By contributing, you agree that your contributions will be released under the MIT License.
