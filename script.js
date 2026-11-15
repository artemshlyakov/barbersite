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

/* Restrained motion: reveal, number count and small ink response on booking CTAs. */
(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const formatPrice = (n) => new Intl.NumberFormat('ru-RU').format(n);
  const animatePrice = (element) => {
    if (element.dataset.animated === 'true') return;
    element.dataset.animated = 'true';
    const target = Number(element.dataset.count || 0);
    if (reduceMotion || !Number.isFinite(target)) {
      element.textContent = formatPrice(target);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      element.textContent = formatPrice(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const counters = [...document.querySelectorAll('[data-count]')];
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        animatePrice(entry.target);
      }
    }, { threshold: 0.35 });
    counters.forEach((el) => counterObserver.observe(el));
  } else {
    counters.forEach(animatePrice);
  }
  if (!reduceMotion && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('has-motion');
    const revealObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -22px 0px' });
    document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));
  }
  if (!reduceMotion) {
    document.querySelectorAll('.button,.header-cta,.mobile-booking').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const rect = element.getBoundingClientRect();
        const ink = document.createElement('span');
        ink.className = 'ink-splash';
        const diameter = Math.max(rect.width, rect.height) * 2.4;
        ink.style.width = diameter + 'px';
        ink.style.left = event.clientX - rect.left + 'px';
        ink.style.top = event.clientY - rect.top + 'px';
        element.append(ink);
        ink.addEventListener('animationend', () => ink.remove(), { once: true });
      });
    });
  }
})();
