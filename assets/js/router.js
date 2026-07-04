/**
 * router.js — Hash routing for project detail pages (client-side)
 *
 * Hash changes trigger opening/closing of the project overlay without a full
 * page load. Also handles back navigation (Escape key) and sharing links via
 * window.location.hash.
 */

const PortfolioRouter = (() => {
  let currentProjectSlug = null;

  function init() {
    // Open overlay for hash-based project links
    if (window.location.hash.startsWith('#/work/')) {
      const slug = window.location.hash.replace('#/work/', '');
      openProject(slug);
    }

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
      if (window.location.hash.startsWith('#/work/')) {
        const slug = window.location.hash.replace('#/work/', '');
        openProject(slug);
      } else {
        closeProject();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('project-view').classList.contains('is-active')) {
        closeProject();
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    });
  }

  async function openProject(slug) {
    if (slug === currentProjectSlug) return;

    const data = await PortfolioData.load();
    const project = data.getBySlug(slug);
    
    if (!project) {
      console.error(`Project not found: ${slug}`);
      return;
    }

    currentProjectSlug = slug;

    // Close existing overlay
    closeProject();

    // Update hash without scroll
    window.history.pushState({}, '', `#/work/${slug}`);

    // Render project overlay
    await PortfolioRenderer.renderProjectOverlay(project);

    // Show overlay
    const projectView = document.getElementById('project-view');
    projectView.classList.add('is-active');

    // Close button handler
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.onclick = () => {
        closeProject();
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      };
    }
  }

  function closeProject() {
    const projectView = document.getElementById('project-view');
    if (projectView.classList.contains('is-active')) {
      projectView.classList.remove('is-active');
      PortfolioRenderer.clearProjectOverlay();
      currentProjectSlug = null;
    }
  }

  function clearProjectOverlay() {
    const projectView = document.getElementById('project-view');
    projectView.innerHTML = '';
    projectView.insertAdjacentHTML('beforeend', `
      <div class="project-topbar">
        <button class="back-btn" id="back-btn">&larr; All Projects</button>
        <div class="project-pager">
          <span class="project-pager-label" id="nav-project-index"></span>
          <button class="pager-btn" id="prev-btn" aria-label="Previous project">&larr;</button>
          <button class="pager-btn" id="next-btn" aria-label="Next project">&rarr;</button>
        </div>
      </div>
      <div class="project-detail-hero">
        <p class="eyebrow" id="project-sector"></p>
        <h1 id="project-title"></h1>
        <p class="text-muted" id="project-client"></p>
        <div class="project-meta-row">
          <div class="contact-item">
            <h3>Year</h3>
            <p id="project-year"></p>
          </div>
        </div>
        <p class="project-description" id="project-description"></p>
      </div>
      <div class="project-gallery" id="project-gallery"></div>
    `);
  }

  return { init, openProject, closeProject };
})();
