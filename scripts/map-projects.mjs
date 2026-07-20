/**
 * map-projects.mjs — Transform old projects.js + project files into data/projects.json
 *
 * Reads the old projects.js (with metadata), scans the projects/ directory for
 * actual files, and outputs a clean data/projects.json with relative paths.
 *
 * Usage:  node scripts/map-projects.mjs
 */

import { readFile, writeFile, opendir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const ROOT = join(__dirname, "..");
const PROJECTS_DIR = join(ROOT, "projects");
const OLD_JS = join(ROOT, "projects.js");
const OUT = join(ROOT, "data", "projects.json");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);
const ALLOWED = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);
const MAX_GALLERY = 12;

/* Category → sector tags */
const SECTOR_MAP = {
  brand: ["Brand Experiences", "Sales Centres"],
  exhibition: ["Exhibitions & Trade Shows"],
  corporate: ["Corporate Environments", "Workplace"],
  pavilion: ["Pavilions & Cultural", "Government"],
};

/* ---- Load old projects.js ---- */
async function loadOldProjects() {
  const raw = await readFile(OLD_JS, "utf-8");
  const json = raw.replace(/^const projects\s*=\s*/, "").replace(/;$/, "");
  return JSON.parse(json);
}

/* ---- Scan a project directory for media files ---- */
async function scanProjectFiles(slug) {
  const dirPath = join(PROJECTS_DIR, slug);
  const files = [];
  try {
    const dir = await opendir(dirPath);
    for await (const entry of dir) {
      const ext = extname(entry.name).toLowerCase();
      if (ALLOWED.has(ext)) {
        files.push(`projects/${slug}/${entry.name}`);
      }
    }
  } catch {
    return [];
  }
  files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return files;
}

/* Manual override for directories whose auto-generated slug doesn't match old data */
const MANUAL_MATCH = {
  "Expo-Dubai-Group-Expo-1958-OS03-Office-Extension": {
    client: "Expo Dubai Group",
    name: "Expo 1958 - Expo Dubai Group_OS03 Office Extension",
  },
  "Expo-Dubai-Group-Expo-1959-Cop28-Sustainability-Exhibition": {
    client: "Expo Dubai Group",
    name: "Expo 1959 - Expo Dubai Group - Cop28 Sustainability Exhibition",
  },
  "Mobile-Pavilion-Saudi-Vision-2030-LEAP2026": {
    client: "Sela",
    name: "Mobile Pavilion for Saudi Vision 2030",
  },
  "JETEX-AERO-2026": {
    client: "JETEX",
    name: "AERO 2026",
  },
};

/* ---- Try to match a directory name to an old project entry ---- */
function findMatchingEntry(dirName, oldProjects) {
  /* Check manual overrides first */
  const manual = MANUAL_MATCH[dirName];
  if (manual) {
    return oldProjects.find(
      (p) => p.client === manual.client && p.name === manual.name
    );
  }

  const norm = (s) =>
    s
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .replace(/-+/g, "-")
      .toLowerCase();

  const dirNorm = norm(dirName);

  /* Pass 1: exact match only */
  for (const p of oldProjects) {
    const clientNorm = norm(p.client.replace(/\s+/g, "-"));
    const nameNorm = norm(p.name.replace(/\s+/g, "-"));

    if (`${clientNorm}-${nameNorm}` === dirNorm) return p;
  }

  /* Pass 2: fuzzy fallback */
  for (const p of oldProjects) {
    const clientNorm = norm(p.client.replace(/\s+/g, "-"));
    const nameNorm = norm(p.name.replace(/\s+/g, "-"));

    /* Dir may omit client prefix */
    if (nameNorm.length > 5 && dirNorm.endsWith(nameNorm)) return p;

    /* Dir starts with client initial (e.g. "SWorld-Cup-Bid-Model" for Sela) */
    if (
      dirNorm.length > nameNorm.length + 1 &&
      dirNorm.endsWith(nameNorm) &&
      dirNorm[0] === clientNorm[0]
    )
      return p;
  }

  return null;
}

/* ---- Main ---- */
async function main() {
  const oldProjects = await loadOldProjects();
  const projectDirs = [];

  try {
    const dir = await opendir(PROJECTS_DIR);
    for await (const entry of dir) {
      if (entry.isDirectory()) projectDirs.push(entry.name);
    }
  } catch {
    console.error("No projects/ directory found.");
    await writeFile(OUT, JSON.stringify([], null, 2));
    return;
  }

  projectDirs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const newProjects = [];
  let matched = 0;
  let unmatched = 0;

  for (const dirName of projectDirs) {
    const files = await scanProjectFiles(dirName);
    if (!files.length) {
      console.log(`  SKIP (no media): ${dirName}`);
      continue;
    }

    const oldEntry = findMatchingEntry(dirName, oldProjects);

    if (oldEntry) {
      matched++;
    } else {
      unmatched++;
    }

    const name = oldEntry ? oldEntry.name : dirName.replace(/-/g, " ");
    const client = oldEntry ? oldEntry.client : "";
    const category = oldEntry ? oldEntry.category : "exhibition";
    const caseStudy = oldEntry ? oldEntry.case_study : "";

    newProjects.push({
      slug: dirName,
      title: name,
      client: client,
      year: guessYear(dirName, oldEntry),
      sectors: SECTOR_MAP[category] || ["Exhibitions & Trade Shows"],
      description: caseStudy,
      thumbnail: files[0],
      gallery: files.slice(0, MAX_GALLERY),
    });
  }

  await writeFile(OUT, JSON.stringify(newProjects, null, 2));
  console.log(
    `\nDone: ${newProjects.length} projects written to data/projects.json`
  );
  console.log(`  Matched from old data: ${matched}`);
  console.log(`  Created from files only: ${unmatched}`);
}

/* ---- Guess year from directory name / old data ---- */
const VISION_YEARS = new Set(["2030"]);
function guessYear(dirName, oldEntry) {
  if (oldEntry && oldEntry.year) return String(oldEntry.year);
  const match = dirName.match(/\b(20\d{2})\b/);
  return match && !VISION_YEARS.has(match[1]) ? match[1] : "";
}

main().catch((err) => {
  console.error("map-projects failed:", err);
  process.exit(1);
});
