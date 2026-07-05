/* render.js — DOM rendering functions */

const RENDER = {};

RENDER.projectCard = function (p, index) {
  const thumb = p.thumbnail || DATA.manifest[p.slug]?.[0] || "";
  return `<div class="project-card" role="button" tabindex="0" data-slug="${p.slug}" data-index="${index}">
    <div class="project-card-frame">
      <span class="project-card-index">${String(index + 1).padStart(2, "0")}</span>
      <img src="${thumb}" alt="${p.title}" loading="lazy" />
    </div>
    <div class="project-card-body">
      <span class="project-card-name">${p.title}</span>
      <span class="project-card-meta">${p.year || ""}</span>
    </div>
  </div>`;
};

RENDER.filterPill = function (sector, active) {
  const label = sector === "__all__" ? "All" : sector;
  return `<button class="filter-pill ${active ? "is-active" : ""}" data-sector="${sector}">${label}</button>`;
};

RENDER.sectorRow = function (sector, count) {
  return `<li class="sector-row">
    <span>${sector}</span>
    <span class="sector-row-count">${count} project${count !== 1 ? "s" : ""}</span>
  </li>`;
};

RENDER.renderWorkGrid = function (projects) {
  const grid = document.getElementById("work-grid");
  const empty = document.getElementById("work-empty");
  const count = document.getElementById("work-count");
  if (!grid) return;
  if (!projects.length) {
    grid.innerHTML = "";
    if (empty) empty.hidden = false;
    if (count) count.textContent = "0 projects";
    return;
  }
  if (empty) empty.hidden = true;
  if (count) count.textContent = `${projects.length} project${projects.length !== 1 ? "s" : ""}`;
  grid.innerHTML = projects.map((p, i) => RENDER.projectCard(p, i)).join("");
  grid.querySelectorAll(".project-card").forEach((el) => {
    el.addEventListener("click", () => ROUTER.goToProject(el.dataset.slug));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ROUTER.goToProject(el.dataset.slug);
      }
    });
  });
};

RENDER.renderFilters = function (activeSector) {
  const container = document.getElementById("filter-pills");
  if (!container) return;
  const sectors = ["__all__", ...Array.from(DATA.sectors).sort()];
  container.innerHTML = sectors.map((s) => RENDER.filterPill(s, s === (activeSector || "__all__"))).join("");
  container.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sector = btn.dataset.sector;
      const filtered = sector === "__all__" ? DATA.projects : DATA.projects.filter((p) => (p.sectors || []).includes(sector));
      RENDER.renderWorkGrid(filtered);
      RENDER.renderFilters(sector);
      RENDER.renderSectors();
    });
  });
};

RENDER.renderSectors = function () {
  const list = document.getElementById("sector-list");
  if (!list) return;
  const sectorCounts = {};
  DATA.projects.forEach((p) => {
    (p.sectors || []).forEach((s) => { sectorCounts[s] = (sectorCounts[s] || 0) + 1; });
  });
  list.innerHTML = Object.entries(sectorCounts).sort(([, a], [, b]) => b - a).map(([s, c]) => RENDER.sectorRow(s, c)).join("");
};

RENDER.renderStats = function () {
  const pEl = document.getElementById("stat-projects");
  const sEl = document.getElementById("stat-sectors");
  const pEl2 = document.getElementById("stat-projects-2");
  const sEl2 = document.getElementById("stat-sectors-2");
  const pCount = DATA.projects.length;
  const sCount = DATA.sectors.size;
  if (pEl) pEl.textContent = String(pCount).padStart(2, "0");
  if (sEl) sEl.textContent = String(sCount).padStart(2, "0");
  if (pEl2) pEl2.textContent = String(pCount).padStart(2, "0");
  if (sEl2) sEl2.textContent = String(sCount).padStart(2, "0");
};

RENDER.renderDetail = function (slug) {
  const project = DATA.projects.find((p) => p.slug === slug);
  if (!project) return;
  document.getElementById("project-sector").textContent = (project.sectors || []).join(" / ") || "\u2014";
  document.getElementById("project-title").textContent = project.title;
  document.getElementById("project-client").textContent = project.client ? `Client: ${project.client}` : "";
  document.getElementById("project-year").textContent = project.year || "\u2014";
  document.getElementById("project-description").textContent = project.description || "";
  const gallery = document.getElementById("project-gallery");
  const assets = project.gallery || DATA.manifest[project.slug] || [];
  gallery.innerHTML = assets.map((src, i) =>
    `<figure data-index="${i}" class="${i === 0 && assets.length > 1 ? "is-wide" : ""}">
      <img src="${src}" alt="${project.title} — image ${i + 1}" loading="lazy" />
    </figure>`
  ).join("");
  gallery.querySelectorAll("figure").forEach((fig) => {
    fig.addEventListener("click", () => {
      const galleryItems = assets.map((s) => ({ src: s, alt: project.title }));
      RENDER.openLightbox(galleryItems, parseInt(fig.dataset.index, 10));
    });
  });
  const currentIdx = DATA.projects.indexOf(project);
  const label = document.getElementById("nav-project-index");
  if (label) label.textContent = `${currentIdx + 1} / ${DATA.projects.length}`;
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  if (prevBtn) {
    prevBtn.onclick = () => {
      const prev = DATA.projects[(currentIdx - 1 + DATA.projects.length) % DATA.projects.length];
      ROUTER.goToProject(prev.slug);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      const next = DATA.projects[(currentIdx + 1) % DATA.projects.length];
      ROUTER.goToProject(next.slug);
    };
  }
};

/* Lightbox */
RENDER.lightboxItems = [];
RENDER.lightboxIndex = 0;

RENDER.openLightbox = function (items, startIndex) {
  RENDER.lightboxItems = items;
  RENDER.lightboxIndex = startIndex;
  RENDER.showLightboxItem(startIndex);
  document.getElementById("lightbox").classList.add("is-active");
  document.body.style.overflow = "hidden";
};

RENDER.showLightboxItem = function (index) {
  const item = RENDER.lightboxItems[index];
  if (!item) return;
  const img = document.getElementById("lightbox-img");
  const video = document.getElementById("lightbox-video");
  if (item.type === "video") {
    img.style.display = "none";
    video.style.display = "";
    video.src = item.src;
    video.play();
  } else {
    video.style.display = "none";
    video.pause();
    img.style.display = "";
    img.src = item.src;
    img.alt = item.alt || "";
  }
};

RENDER.closeLightbox = function () {
  document.getElementById("lightbox").classList.remove("is-active");
  document.body.style.overflow = "";
  RENDER.lightboxItems = [];
};

RENDER.navigateLightbox = function (dir) {
  RENDER.lightboxIndex = (RENDER.lightboxIndex + dir + RENDER.lightboxItems.length) % RENDER.lightboxItems.length;
  RENDER.showLightboxItem(RENDER.lightboxIndex);
};

document.addEventListener("DOMContentLoaded", () => {
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  document.getElementById("lightbox-close")?.addEventListener("click", RENDER.closeLightbox);
  document.getElementById("lightbox-prev")?.addEventListener("click", () => RENDER.navigateLightbox(-1));
  document.getElementById("lightbox-next")?.addEventListener("click", () => RENDER.navigateLightbox(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) RENDER.closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("is-active")) return;
    if (e.key === "Escape") RENDER.closeLightbox();
    if (e.key === "ArrowLeft") RENDER.navigateLightbox(-1);
    if (e.key === "ArrowRight") RENDER.navigateLightbox(1);
  });
});
