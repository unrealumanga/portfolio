# Copilot instructions for the portfolio repository

## Language & framework
- Pure HTML/CSS/JS — no framework, no build step, no package manager.
- GitHub Pages serves from the root of the `main` branch directly.

## Naming conventions
- `data/projects.json` — editorial project catalogue (edit by hand).
- `data/manifest.json` — auto-generated file inventory (run `node scripts/generate-manifest.mjs`).
- Project asset directories live under `projects/<slug>/`.
- CSS follows the token system in `assets/css/tokens.css`.

## Architecture
- `data.js` loads `projects.json` and `manifest.json` into global `DATA` object.
- `render.js` (global `RENDER`) handles all DOM creation and lightbox.
- `router.js` (global `ROUTER`) manages the hash-based project detail view.
- `main.js` bootstraps everything.

## Workflow
1. Add an entry to `data/projects.json`.
2. Drop assets into `projects/<slug>/`.
3. Run `node scripts/generate-manifest.mjs` to update `data/manifest.json`.
4. Commit and push. GitHub Actions auto-re-runs step 3.
