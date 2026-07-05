# Hethusha Umanga Seneviratne — Portfolio

Experiential design portfolio, served via GitHub Pages.

## Quick start

```bash
./serve.sh              # starts at http://localhost:8080
./serve.sh 3000         # custom port
```

## Adding a project

1. Add an entry to `data/projects.json`.
2. Drop assets into `projects/<slug>/`.
3. Run `node scripts/generate-manifest.mjs`.
4. Commit and push.

GitHub Actions automatically re-generates `data/manifest.json` when `projects/` or `data/projects.json` changes on `main`.

## Migrating from old format

The old `projects.js` data was mapped to the new format via:

```bash
node scripts/map-projects.mjs
```

This reads `projects.js`, scans `projects/` directories for actual files, and produces `data/projects.json` with relative file paths.

## Stack

- Pure HTML / CSS / JS — no framework, no build step.
- CSS custom properties (`tokens.css`) for theming.
- Zero dependencies.

## Design tokens

- Surfaces: near-black (`#0b0c09`)
- Accent: lime (`#BEFF8B`) + steel-blue (`#9DBBC5`)
- Display type: Big Shoulders Display
- Body: Inter
- Mono: IBM Plex Mono
