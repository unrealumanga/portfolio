/**
 * reveal.js — Scroll-reveal and sheet-rail indicator
 *
 * Uses IntersectionObserver to reveal content as the user scrolls.
 * Also highlights the current sheet in the right rail and manages
 * header state on scroll.
 */

const PortfolioReveal = (() => {
  let observer = null;
  let lastScrollY = window.scrollY;

  function init() {
    // Setup intersection observer for scroll reveals
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '50px'
    });

    // Observe all elements with data-reveal
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
    document.querySelectorAll('[data-reveal-group]').forEach(el => observer.observe(el));

    // Highlight sheet in rail based on scroll position
    window.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('.sheet');
      const railTabs = document.querySelectorAll('.sheet-tab');
      let currentSection = null;

      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 150 && rect.top >= -500) {
          currentSection = section.getAttribute('id');
        }
      });

      railTabs.forEach(tab => {
        tab.classList.remove('is-active');
        if (currentSection && tab.dataset.target === currentSection) {
          tab.classList.add('is-active');
        }
      });

      // Header state on scroll
      const header = document.querySelector('.site-header');
      if (window.scrollY > 100) {
        header.classList.add('header-scrolled');
      } else {
        header.classList.remove('header-scrolled');
      }

      lastScrollY = window.scrollY;
    });

    // Sheet tab clicks
    document.querySelectorAll('.sheet-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        const element = document.getElementById(target);
        if (element) {
          window.scrollTo({
            top: element.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      });
    });
  }

  function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 80,
        behavior: 'smooth'
      });
    }
  }

  return { init, scrollToSection };
})();
