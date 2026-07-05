/* main.js — Bootstrap: load data, init rendering, nav, scroll */

(async function () {
  await loadData();
  if (!DATA.ready) {
    document.getElementById("work-grid").innerHTML =
      '<p class="work-empty">Failed to load project data.</p>';
    return;
  }

  RENDER.renderStats();
  RENDER.renderSectors();
  RENDER.renderFilters("__all__");
  RENDER.renderWorkGrid(DATA.projects);
  ROUTER.handleHash();

  /* Header scroll */
  const header = document.querySelector(".site-header");
  let ticking = false;
  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        header.classList.toggle("is-scrolled", window.scrollY > 60);
        ticking = false;
      });
      ticking = true;
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Mobile menu */
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("is-open");
      document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("is-open").toString());
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* Sheet rail intersection + click */
  const tabs = document.querySelectorAll(".sheet-tab");
  const sheets = document.querySelectorAll(".sheet, .hero");

  if (tabs.length && sheets.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            tabs.forEach((tab) => {
              tab.classList.toggle("is-active", tab.dataset.target === id);
            });
            const prog = document.querySelector(".sheet-rail-progress");
            if (prog) {
              const idx = Array.from(sheets).indexOf(entry.target) + 1;
              prog.textContent = `${String(idx).padStart(2, "0")}/${String(sheets.length).padStart(2, "0")}`;
            }
          }
        });
      },
      { threshold: 0.35 }
    );
    sheets.forEach((s) => observer.observe(s));

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = document.getElementById(tab.dataset.target);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      });
    });
  }
})();
