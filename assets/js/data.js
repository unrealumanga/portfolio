/**
 * data.js — Loads and merges data/projects.json + data/manifest.json
 *
 * projects.json → editorial metadata (name, client, year, sector, copy)
 * manifest.json → auto‑generated media list (see scripts/generate-manifest.mjs)
 *
 * Splitting these two files is what keeps the site modular: editorial content
 * and filesystem state never live in the same place.
 */

const PortfolioData = (() => {
  let projects = [];
  let sectors = [];

  async function load() {
    const [projectsRes, manifestRes] = await Promise.all([
      fetch("data/projects.json"),
      fetch("data/manifest.json"),
    ]);

    if (!projectsRes.ok || !manifestRes.ok) {
      throw new Error("Failed to load portfolio data.");
    }

    const projectsRaw = await projectsRes.json();
    const manifest = await manifestRes.json();

    projects = projectsRaw.map((p) => {
      const entry = manifest[p.folder];
      const media = entry
        ? entry.media.map((m) => ({
            ...m,
            url: `projects/${p.folder}/${m.file}`,
          }))
        : [];
      const cover = entry ? `projects/${p.folder}/${entry.cover}` : "";

      return { ...p, media, cover };
    });

    sectors = [...new Set(projects.map((p) => p.sector))].sort();

    return { projects, sectors };
  }

  function getProjects({ sector } = {}) {
    if (!sector || sector === "all") return projects;
    return projects.filter((p) => p.sector === sector);
  }

  function getBySlug(slug) {
    return projects.find((p) => p.slug === slug);
  }

  function getIndex(slug) {
    return projects.findIndex((p) => p.slug === slug);
  }

  function getSectors() {
    return sectors;
  }

  return { load, getProjects, getBySlug, getIndex, getSectors };
})();
