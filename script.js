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

const mapElement = document.querySelector('[data-map]');
if (mapElement && window.L) {
  const showMap = () => {
    mapElement.querySelector('.map-fallback')?.remove();
    const point = [56.145343, 40.421006];
    const map = L.map(mapElement, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: false
    }).setView(point, 16);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(map);
    L.marker(point, {
      icon: L.divIcon({ className: 'map-pin', html: '<span aria-hidden="true"></span>', iconSize: [30, 39], iconAnchor: [15, 39] }),
      keyboard: false
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      showMap();
    }, { rootMargin: '300px' });
    observer.observe(mapElement);
  } else {
    showMap();
  }
}


/* Heritage polish: subtle on-scroll reveal and price counting; no dependencies. */
(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const figures = [...document.querySelectorAll('[data-count]')];
  const shown = (n) => new Intl.NumberFormat('ru-RU').format(n);
  const count = (el) => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const end = Number(el.dataset.count);
    if (!Number.isFinite(end) || reduced) { el.textContent = shown(end); return; }
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / 750);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = shown(Math.round(end * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, control) => {
      for (const entry of entries) if (entry.isIntersecting) {
        control.unobserve(entry.target);
        count(entry.target);
      }
    }, { threshold: 0.1 });
    figures.forEach(el => observer.observe(el));
  } else figures.forEach(count);

  if (!reduced && 'IntersectionObserver' in window) {
    const elements = [...document.querySelectorAll('[data-reveal]')];
    const observer = new IntersectionObserver((entries, control) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        control.unobserve(entry.target);
      }
    }, { threshold: 0.03, rootMargin: '0px 0px -20px 0px' });
    elements.forEach(el => observer.observe(el));
    document.documentElement.classList.add('heritage-motion');
  }
  if (!reduced) {
    document.querySelectorAll('.button-primary,.header-cta,.mobile-booking').forEach((el) => {
      el.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const rect = el.getBoundingClientRect();
        const pulse = document.createElement('span');
        pulse.className = 'quiet-pulse';
        pulse.style.left = (event.clientX - rect.left) + 'px';
        pulse.style.top = (event.clientY - rect.top) + 'px';
        el.append(pulse);
        pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
      });
    });
  }
})();
