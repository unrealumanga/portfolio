/**
 * main.js — Bootstraps the portfolio app
 *
 * Loads data, renders initial UI, and wires up all event handlers.
 * This is the entry point that puts everything together.
 */

const PortfolioApp = (() => {
  let currentSector = 'all';

  async function init() {
    // Load portfolio data
    const data = await PortfolioData.load();
    const projects = data.getProjects();
    const sectors = data.getSectors();

    // Render initial UI
    PortfolioRenderer.renderWorkGrid(projects);
    PortfolioRenderer.renderFilterPills(sectors);
    PortfolioRenderer.renderSectorList(sectors);

    // Update hero stats
    updateHeroStats(projects, sectors);

    // Set up event listeners
    setupEventListeners(data);

    // Initialize router
    PortfolioRouter.init();

    // Initialize reveal animations
    PortfolioReveal.init();

    console.log('Portfolio app initialized');
  }

  function updateHeroStats(projects, sectors) {
    const projectCountEl = document.getElementById('stat-projects');
    const sectorCountEl = document.getElementById('stat-sectors');
    const projectCount2El = document.getElementById('stat-projects-2');
    const sectorCount2El = document.getElementById('stat-sectors-2');

    if (projectCountEl) projectCountEl.textContent = projects.length;
    if (projectCount2El) projectCount2El.textContent = projects.length;
    if (sectorCountEl) sectorCountEl.textContent = sectors.length;
    if (sectorCount2El) sectorCount2El.textContent = sectors.length;
  }

  function setupEventListeners(data) {
    // Filter pills
    document.addEventListener('click', (e) => {
      if (e.target.closest('.pill')) {
        const pill = e.target.closest('.pill');
        currentSector = pill.dataset.sector;
        
        // Update active pill
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        
        // Render filtered projects
        PortfolioRenderer.renderWorkGrid(data.getProjects({ sector: currentSector }));
      }
    });

    // Sector list links
    document.addEventListener('click', (e) => {
      if (e.target.closest('#sector-list a')) {
        e.preventDefault();
        const sector = e.target.closest('#sector-list a').dataset.sector;
        currentSector = sector;
        
        // Update filter pills
        document.querySelectorAll('.pill').forEach(p => {
          p.classList.toggle('is-active', p.dataset.sector === sector);
        });
        
        // Render projects
        PortfolioRenderer.renderWorkGrid(data.getProjects({ sector }));
      }
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const mainNav = document.getElementById('main-nav');
    
    if (menuToggle && mainNav) {
      menuToggle.addEventListener('click', () => {
        mainNav.classList.toggle('is-open');
        document.body.classList.toggle('nav-open');
        
        const spans = menuToggle.querySelectorAll('span');
        if (mainNav.classList.contains('is-open')) {
          spans[0].style.transform = 'rotate(45deg) translate(5px, 6px)';
          spans[1].style.opacity = '0';
          spans[2].style.transform = 'rotate(-45deg) translate(5px, -6px)';
        } else {
          spans[0].style.transform = '';
          spans[1].style.opacity = '';
          spans[2].style.transform = '';
        }
      });

      // Close menu when a link is clicked
      document.querySelectorAll('#main-nav a').forEach(link => {
        link.addEventListener('click', () => {
          mainNav.classList.remove('is-open');
          document.body.classList.remove('nav-open');
          
          const spans = menuToggle.querySelectorAll('span');
          spans[0].style.transform = '';
          spans[1].style.opacity = '';
          spans[2].style.transform = '';
        });
      });
    }

    // Search projects by slug in the project overlay
    document.addEventListener('click', (e) => {
      if (e.target.closest('.project-card')) {
        e.preventDefault();
        const slug = e.target.closest('.project-card').dataset.project;
        PortfolioRouter.openProject(slug);
      }
    });

    // Header click to return to top
    document.getElementById('logo-home-2').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  return { init };
})();

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  PortfolioApp.init();
});
