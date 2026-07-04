/**
 * generate-manifest.mjs — Auto-discovers project media files and writes manifest.json
 *
 * Scans the /projects folder for each project's images/videos and builds a manifest
 * mapping folder → {media: [{file, type, cover: boolean}], cover: string}.
 *
 * No npm dependencies — pure Node `fs`/`path`. Works in CI (GitHub Action) and locally.
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const MANIFEST_PATH = path.join(process.cwd(), 'data', 'manifest.json');

// File extensions that count as media (case-insensitive)
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.wmv', '.flv']);

function naturalSort(a, b) {
  const numA = parseInt(a.match(/\d+/));
  const numB = parseInt(b.match(/\d+/));
  if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b);
  if (isNaN(numA)) return -1;
  if (isNaN(numB)) return 1;
  return numA - numB;
}

function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

function isImageFile(filename) {
  const ext = getFileExtension(filename);
  return IMAGE_EXTS.has(ext);
}

function isVideoFile(filename) {
  const ext = getFileExtension(filename);
  return VIDEO_EXTS.has(ext);
}

function isCoverFile(filename) {
  const lower = filename.toLowerCase();
  return lower.includes('cover') || lower.includes('hero') || lower.includes('thumb') || lower.includes('thumbnail');
}

function discoverProjectMedia(projectFolderPath) {
  const entries = fs.readdirSync(projectFolderPath, { withFileTypes: true });
  const media = [];
  let cover = '';

  const images = entries
    .filter(entry => entry.isFile() && isImageFile(entry.name))
    .map(entry => entry.name)
    .sort(naturalSort);

  const videos = entries
    .filter(entry => entry.isFile() && isVideoFile(entry.name))
    .map(entry => entry.name)
    .sort(naturalSort);

  for (const file of images) {
    const meta = { file, type: 'image' };
    if (!cover && isCoverFile(file)) {
      meta.cover = true;
      cover = file;
    }
    media.push(meta);
  }

  for (const file of videos) {
    media.push({ file, type: 'video' });
  }

  if (!cover && media.length > 0) {
    media[0].cover = true;
    cover = media[0].file;
  }

  return { media, cover };
}

function generateManifest() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${PROJECTS_DIR}`);
    return;
  }

  const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const manifest = {};

  for (const folder of projects) {
    const projectFolderPath = path.join(PROJECTS_DIR, folder);
    const { media, cover } = discoverProjectMedia(projectFolderPath);
    manifest[folder] = { media, cover };
    console.log(`✓ ${folder}: ${media.length} files (cover: ${cover || 'none'})`);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nManifest written to ${MANIFEST_PATH}\n`);
  console.log(`Total projects processed: ${projects.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    generateManifest();
  } catch (error) {
    console.error('Error generating manifest:', error.message);
    process.exit(1);
  }
}

export { generateManifest };
