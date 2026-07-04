# portfolio.json

**Live site:** https://unrealumanga.github.io/portfolio/

**Repo:** https://github.com/unrealumanga/portfolio

**Design reference:** [wembi.ai](https://www.wembi.ai/) by ET Studio (Awwwards Site of the Day, Jul 2026)

This repo now uses a **modular architecture** based on wembi.ai's design system:

- Six numbered "drawing sheets" (SHT.001–SHT.006) with technical grid layout
- Auto‑discovered media via `scripts/generate-manifest.mjs` – no manual image lists
- Clean separation: `data/projects.json` (editorial) + `data/manifest.json` (filesystem)
- Pure HTML/CSS/JS, no frameworks, runs directly on GitHub Pages

## Add a new project (under 2 minutes)

1. Create a folder under `/projects/` and drop your images/videos in it — any name, any file naming, no manual list to maintain.
2. Add one entry to `data/projects.json`:
   ```json
   {
     "id": 35,
     "slug": "client-project-name",
     "folder": "Your-Folder-Name",
     "name": "Project Name",
     "client": "Client Name",
     "year": "2026",
     "sector": "Real Estate & Masterplanning",
     "description": "One paragraph about the project.",
     "featured": false
   }
   ```
3. Run `npm run manifest` (or just push — the GitHub Action does this automatically) and commit.

That's it. No image lists to hand‑type, no code to touch.

## Tech stack

- **Plain HTML, CSS, JavaScript** — no framework, no build step
- **Design tokens** in `assets/css/tokens.css` (colors, type, spacing)
- **GitHub Pages** serves the static site
- **GitHub Action** (`.github/workflows/update-manifest.yml`) regenerates `data/manifest.json` whenever `/projects` or `data/projects.json` changes

## Local development

```bash
npm run dev
# or
./serve.sh
```

Opens `http://localhost:8080` after regenerating the manifest.

## Architecture

```
portfolio/
├── index.html                    (Minimal page shell – markup only)
├── assets/
│   ├── css/
│   │   ├── tokens.css             (Design tokens – colors, type, spacing)
│   │   ├── base.css               (Reset, accessibility, typography)
│   │   ├── layout.css              (Section scaffolding, hero, grids, responsive)
│   │   ├── components.css         (Buttons, cards, lightbox, mobile nav)
│   │   └── motion.css             (Scroll‑reveal utilities)
│   └── js/
│       ├── data.js                (Fetches & merges JSON files)
│       ├── render.js              (Renders DOM from data)
│       ├── router.js              (Hash routing for project overlays)
│       ├── reveal.js              (Scroll reveals, sheet rail, header)
│       └── main.js                (Bootstraps everything)
├── data/
│   ├── projects.json              (Editorial content – YOU edit this)
│   └── manifest.json              (Auto‑generated – reads `/projects` folders)
├── scripts/
│   └── generate-manifest.mjs      (Discovers media, writes manifest.json)
├── .github/workflows/
│   └── update-manifest.yml        (Runs the script in CI, commits updated manifest)
├── package.json
├── serve.sh
├── README.md
└── IMPLEMENTATION_PLAN.md
```

## Maintaining this repo

- **Project folders** (`/projects/`) contain your images/videos – any naming, no format constraints
- `data/projects.json` is the only hand‑editable file
- `data/manifest.json` is generated – never edit manually
- Run `node scripts/generate-manifest.mjs` locally before pushing if you want a preview
- GitHub Action keeps `manifest.json` in sync automatically

## Credits

- Design direction inspired by [wembi.ai](https://www.wembi.ai/), Site of the Day on Awwwards, by ET Studio.
- Fonts: [Big Shoulders Display](https://fonts.google.com/specimen/Big+Shoulders+Display),
  [Inter](https://fonts.google.com/specimen/Inter), and
  [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) via Google Fonts.

## License

All rights reserved — this is a personal portfolio. Code structure is free to reference; project imagery and content belong to Hethusha Umanga Seneviratne.
