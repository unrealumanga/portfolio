/* router.js — Hash-based view router */

const ROUTER = {
  currentSlug: null,
  previousScrollY: 0,
};

ROUTER.goToProject = function (slug) {
  this.previousScrollY = window.scrollY;
  this.currentSlug = slug;
  window.location.hash = `project-${slug}`;
};

ROUTER.goToList = function () {
  this.currentSlug = null;
  window.location.hash = "";
  document.getElementById("project-view").classList.remove("is-active");
  document.body.style.overflow = "";
  window.scrollTo({ top: this.previousScrollY, behavior: "auto" });
};

ROUTER.handleHash = function () {
  const hash = window.location.hash.slice(1);
  const view = document.getElementById("project-view");
  if (!view) return;

  if (hash.startsWith("project-")) {
    const slug = hash.replace("project-", "");
    this.currentSlug = slug;
    RENDER.renderDetail(slug);
    view.classList.add("is-active");
    document.body.style.overflow = "hidden";
    view.scrollTop = 0;
  } else {
    view.classList.remove("is-active");
    document.body.style.overflow = "";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("back-btn")?.addEventListener("click", () => ROUTER.goToList());
  window.addEventListener("hashchange", () => ROUTER.handleHash());
});
