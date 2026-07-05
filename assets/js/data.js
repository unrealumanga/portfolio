/* data.js — Load project and manifest data */

const DATA = {
  projects: [],
  manifest: {},
  sectors: new Set(),
  ready: false,
};

async function loadData() {
  try {
    const [projRes, manRes] = await Promise.all([
      fetch("data/projects.json"),
      fetch("data/manifest.json"),
    ]);
    DATA.projects = await projRes.json();
    DATA.manifest = await manRes.json();

    DATA.projects.forEach((p) => {
      (p.sectors || []).forEach((s) => DATA.sectors.add(s));
    });

    DATA.ready = true;
    return DATA;
  } catch (err) {
    console.error("Failed to load data:", err);
    DATA.ready = false;
    return DATA;
  }
}
