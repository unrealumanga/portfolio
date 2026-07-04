/**
 * render.js — Turns project data into DOM elements (grid, detail view, gallery)
 *
 * All DOM manipulation lives here. The rest of the app just provides data
 * and wiring (router, reveal, events). This keeps index.html tiny and
 * makes each section easy to reason about.
 */

const PortfolioRenderer = (() => {
  function renderProjectCard(project) {
    const index = projects.findIndex(p => p.id === project.id) + 1;
    return `
      <a href="#/work/${project.slug}" class="project-card" data-project="${project.slug}">
        <div class="project-card-frame">
          <img src="projects/${project.folder}/${project.cover}" alt="${project.name}" loading="lazy" />
          <div class="project-card-index">N&deg;${index}</div>
        </div>
        <div class="project-card-body">
          <h3 class="project-card-name">${project.name}</h3>
          <div class="project-card-meta">
            <span>${project.client}</span><br>
            <span>${project.year}</span>
          </div>
        </div>
      </a>
    `;
  }

  function renderProjectDetail(project) {
    return `
      <div class="project-detail-container">
        <div class="project-meta-row">
          <div class="contact-item">
            <h3>Year</h3>
            <p>${project.year}</p>
          </div>
        </div>

        ${project.media && project.media.length > 0 ? `
          <div class="project-gallery">
            ${project.media.map((m, i) => `
              <div class="project-gallery-item" data-index="${i}">
                ${m.type === 'image' ? `<img src="${m.url}" alt="Project media" loading="lazy" />` : 
                 `<video controls><source src="${m.url}" type="video/mp4"></video></div>`}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  async function renderProjectOverlay(project) {
    const detailHtml = renderProjectDetail(project);
    const projectView = document.getElementById('project-view');
    const gallery = document.getElementById('project-gallery');
    
    // Insert detail HTML
    projectView.insertAdjacentHTML('afterbegin', detailHtml);
    
    // Setup lightbox navigation
    setupLightboxNavigation(project.media);
  }

  function setupLightboxNavigation(mediaItems) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxVideo = document.getElementById('lightbox-video');
    const closeBtn = document.getElementById('lightbox-close');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');

    let currentIndex = 0;

    function showItem(index) {
      if (index < 0 || index >= mediaItems.length) return;
      currentIndex = index;
      
      const item = mediaItems[index];
      const url = item.url;
      
      if (item.type === 'image') {
        lightboxImg.src = url;
        lightboxImg.alt = 'Project media';
        lightboxVideo.style.display = 'none';
        lightboxImg.style.display = 'block';
      } else {
        lightboxVideo.src = url;
        lightboxVideo.style.display = 'block';
        lightboxImg.style.display = 'none';
        lightboxVideo.load();
        lightboxVideo.play();
      }
    }

    closeBtn.addEventListener('click', () => {
      lightbox.classList.remove('is-active');
      lightboxVideo.pause();
      lightboxVideo.src = '';
    });

    prevBtn.addEventListener('click', () => {
      showItem(currentIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
      showItem(currentIndex + 1);
    });

    // Initialize with first item
    if (mediaItems.length > 0) {
      showItem(0);
    }
  }

  function clearWorkGrid() {
    const workGrid = document.getElementById('work-grid');
    if (workGrid) workGrid.innerHTML = '';
  }

  function renderWorkGrid(projects) {
    clearWorkGrid();
    const workGrid = document.getElementById('work-grid');
    
    if (projects.length === 0) {
      const emptyMsg = document.getElementById('work-empty');
      if (emptyMsg) emptyMsg.hidden = false;
      return;
    }

    const emptyMsg = document.getElementById('work-empty');
    if (emptyMsg) emptyMsg.hidden = true;
    
    workGrid.insertAdjacentHTML('beforeend', projects.map(renderProjectCard).join(''));
  }

  function renderFilterPills(sectors) {
    const pillsContainer = document.getElementById('filter-pills');
    if (!pillsContainer) return;
    
    const pills = sectors.map(sector => `
      <button class="pill" data-sector="${sector}">${sector}</button>
    `).join('');
    
    pillsContainer.innerHTML = `<button class="pill is-active" data-sector="all">All</button>` + pills;
  }

  function renderSectorList(sectors) {
    const sectorList = document.getElementById('sector-list');
    if (!sectorList) return;
    
    const items = sectors.map(sector => `
      <li><a href="#work" data-sector="${sector}">${sector}</a></li>
    `).join('');
    
    sectorList.innerHTML = items;
  }

  return {
    renderWorkGrid,
    renderProjectOverlay,
    renderFilterPills,
    renderSectorList,
    clearWorkGrid
  };
})();
