/**
 * generate-manifest.mjs — Scans projects/ and writes data/manifest.json
 *
 * Usage:  node scripts/generate-manifest.mjs
 *
 * Scans each subdirectory under projects/ and maps:
 *   { "<slug>": ["projects/<slug>/file1.jpg", "projects/<slug>/file2.jpg", ...] }
 *
 * Compatible with Node >= 18 (uses fs.opendir, no dependencies).
 */

import { opendir, writeFile, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const ROOT = join(__dirname, "..");
const PROJECTS_DIR = join(ROOT, "projects");
const OUT = join(ROOT, "data", "manifest.json");
const DATA_JSON = join(ROOT, "data", "projects.json");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);
const ALLOWED = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

/* Load existing projects.json to get gallery limits */
async function loadProjectLimits() {
  try {
    const raw = await readFile(DATA_JSON, "utf-8");
    const projects = JSON.parse(raw);
    const limits = {};
    for (const p of projects) {
      limits[p.slug] = (p.gallery || []).length;
    }
    return limits;
  } catch {
    return {};
  }
}

async function scan() {
  const galleryLimits = await loadProjectLimits();

  let projectsDir;
  try {
    projectsDir = await opendir(PROJECTS_DIR);
  } catch {
    await writeFile(OUT, JSON.stringify({}, null, 2));
    console.log("No projects/ directory found. Wrote empty manifest.");
    return;
  }

  const manifest = {};

  for await (const entry of projectsDir) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const dirPath = join(PROJECTS_DIR, slug);
    const files = [];

    try {
      const dir = await opendir(dirPath);
      for await (const file of dir) {
        const ext = extname(file.name).toLowerCase();
        if (ALLOWED.has(ext)) {
          files.push(`projects/${slug}/${file.name}`);
        }
      }
    } catch {
      // skip unreadable directories
    }

    files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    /* Limit to the same number as projects.json gallery, or 12 */
    const limit = galleryLimits[slug] || 12;
    manifest[slug] = files.slice(0, limit);
  }

  await writeFile(OUT, JSON.stringify(manifest, null, 2));
  console.log(`manifest.json written — ${Object.keys(manifest).length} project(s) scanned.`);
}

scan().catch((err) => {
  console.error("generate-manifest failed:", err);
  process.exit(1);
});
