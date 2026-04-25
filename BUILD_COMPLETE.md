# JARVIS Build Status

The workspace currently builds end-to-end from the project root:

```bash
npm run build
```

That produces:

- `frontend/dist/` - compiled React dashboard
- `backend/dist/` - compiled Node/Express runtime

The backend now serves the frontend bundle after a production build, so a local production-style run is:

```bash
npm run build
npm start
```

For architecture and runtime behavior, use `README.md` as the source of truth.
