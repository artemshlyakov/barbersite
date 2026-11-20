const isEnglish = document.documentElement.lang === 'en';
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');

if (toggle && nav) {
  const labels = isEnglish
    ? { open: 'Open menu', close: 'Close menu' }
    : { open: 'Открыть меню', close: 'Закрыть меню' };

  const close = (restoreFocus = false) => {
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', labels.open);
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? labels.close : labels.open);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => close()));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(true);
  });
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) close();
  });
}

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero');
if (hero && 'IntersectionObserver' in window) {
  const bookingObserver = new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('show-booking', !entry.isIntersecting);
  }, { threshold: 0 });
  bookingObserver.observe(hero);
}
const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !reducedMotion.matches && revealItems.length) {
  document.documentElement.classList.add('js-motion');
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { threshold: 0.1, rootMargin: '0px 0px 50px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
}

const galleryRail = document.querySelector('.gallery-grid');
if (galleryRail) {
  const control = document.createElement('div');
  control.className = 'gallery-control';
  control.innerHTML = `<button class="gallery-arrow gallery-arrow-prev" type="button" aria-label="${isEnglish ? 'Previous works' : 'Предыдущие работы'}"></button><div class="gallery-track"><img class="gallery-clipper" src="${isEnglish ? '../' : './'}assets/icons/gallery-clipper.svg" alt="" draggable="false"></div><button class="gallery-arrow gallery-arrow-next" type="button" aria-label="${isEnglish ? 'Next works' : 'Следующие работы'}"></button>`;
  galleryRail.after(control);
  document.documentElement.classList.add('has-gallery-control');
  const track = control.querySelector('.gallery-track');
  const clipper = control.querySelector('.gallery-clipper');
  const prev = control.querySelector('.gallery-arrow-prev');
  const next = control.querySelector('.gallery-arrow-next');
  const maxScroll = () => Math.max(0, galleryRail.scrollWidth - galleryRail.clientWidth);
  const update = () => {
    const max = maxScroll();
    const travel = Math.max(0, track.clientWidth - clipper.clientWidth);
    const progress = max ? Math.min(1, Math.max(0, galleryRail.scrollLeft / max)) : 0;
    clipper.style.left = `${progress * travel}px`;
    control.hidden = max === 0;
    prev.disabled = progress <= 0.001;
    next.disabled = progress >= 0.999;
  };
  const step = () => {
    const item = galleryRail.querySelector('.gallery-item');
    return item ? item.getBoundingClientRect().width + parseFloat(getComputedStyle(galleryRail).gap) : galleryRail.clientWidth;
  };
  prev.addEventListener('click', () => galleryRail.scrollBy({ left: -step(), behavior: reducedMotion.matches ? 'instant' : 'smooth' }));
  next.addEventListener('click', () => galleryRail.scrollBy({ left: step(), behavior: reducedMotion.matches ? 'instant' : 'smooth' }));
  let dragStart;
  clipper.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dragStart = { x: event.clientX, scroll: galleryRail.scrollLeft };
    galleryRail.classList.add('is-clipper-dragging');
    clipper.setPointerCapture(event.pointerId);
  });
  clipper.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const travel = track.clientWidth - clipper.clientWidth;
    if (travel > 0) galleryRail.scrollLeft = dragStart.scroll + (event.clientX - dragStart.x) / travel * maxScroll();
  });
  const finishDrag = () => {
    if (!dragStart) return;
    dragStart = null;
    galleryRail.classList.remove('is-clipper-dragging');
    update();
  };
  clipper.addEventListener('pointerup', finishDrag);
  clipper.addEventListener('pointercancel', finishDrag);
  // Capture on the original photo link so a stationary click still opens it.
  let photoDrag = null;
  galleryRail.addEventListener('pointerdown', (event) => {
    const link = event.target.closest('[data-lightbox]');
    if (event.pointerType !== 'mouse' || event.button !== 0 || !link) return;
    photoDrag = { x: event.clientX, scroll: galleryRail.scrollLeft, moved: false };
    link.setPointerCapture(event.pointerId);
  });
  galleryRail.addEventListener('dragstart', (event) => {
    if (photoDrag) event.preventDefault();
  });
  galleryRail.addEventListener('pointermove', (event) => {
    if (!photoDrag || event.pointerType !== 'mouse') return;
    const delta = event.clientX - photoDrag.x;
    if (!photoDrag.moved && Math.abs(delta) < 6) return;
    photoDrag.moved = true;
    galleryRail.classList.add('is-photo-dragging');
    galleryRail.scrollLeft = photoDrag.scroll - delta;
  });
  let suppressPhotoClick = false;
  galleryRail.addEventListener('lostpointercapture', () => {
    suppressPhotoClick = Boolean(photoDrag?.moved);
    photoDrag = null;
    galleryRail.classList.remove('is-photo-dragging');
    setTimeout(() => { suppressPhotoClick = false; }, 0);
  });
  galleryRail.addEventListener('click', (event) => {
    if (photoDrag?.moved || suppressPhotoClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  galleryRail.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

const lightbox = document.querySelector('.lightbox');
if (lightbox) {
  const lightboxImage = lightbox.querySelector('img');
  const closeButton = lightbox.querySelector('.lightbox-close');
  let previousFocus;
  const closeLightbox = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
    lightboxImage.removeAttribute('src');
    previousFocus?.focus();
  };
  document.querySelectorAll('[data-lightbox]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      previousFocus = document.activeElement;
      lightboxImage.src = link.href;
      lightboxImage.alt = link.querySelector('img')?.alt || '';
      lightbox.hidden = false;
      document.body.classList.add('lightbox-open');
      closeButton.focus();
    });
  });
  closeButton.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus();
    }
  });
}
