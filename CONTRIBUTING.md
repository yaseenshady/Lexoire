# Contributing to JARVIS

We love contributions! Here's how to get started.

## Getting Started

1. **Fork the repo** on GitHub
2. **Clone your fork**: `git clone https://github.com/YOUR_USERNAME/jarvis.git`
3. **Install dependencies**: `npm run install:all`
4. **Start development**: `npm run dev`

## Development Workflow

### Running the App

**Development (with hot reload):**
```bash
npm run dev
```
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

**Production build:**
```bash
npm run build
npm start
```

### Code Structure

- **`frontend/src`** - React + Vite UI (components, hooks, services)
- **`backend/src`** - Express + Socket.IO server (API, Copilot integration, persistence)
- **`shared`** - Shared types and utilities
- **`electron`** - Electron app wrapper for standalone executable

### Making Changes

1. **Create a feature branch**: `git checkout -b feature/your-feature`
2. **Make your changes** and test thoroughly
3. **Build to verify**: `npm run build`
4. **Commit with clear messages**: `git commit -m "feat: add cool feature"`
5. **Push to your fork**: `git push origin feature/your-feature`
6. **Open a Pull Request** with a clear description

## Commit Convention

We use conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation
- `style:` - Code style (formatting, missing semicolons, etc)
- `refactor:` - Code refactoring without feature changes
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example: `feat: add voice confidence indicators`

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Keep components small and focused
- Add comments for non-obvious logic

## Testing

Before submitting a PR:
- Test locally in development mode
- Test the production build: `npm run build && npm start`
- Verify no console errors or warnings
- Test voice features in Chrome/Edge (best browser support)

## Questions?

Open an issue or start a discussion on GitHub. We're here to help!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
