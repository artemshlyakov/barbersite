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

// The HTML contains the final prices, so they stay correct without JavaScript or motion.
const priceList = document.querySelector('.price-list');
const priceCounters = [...document.querySelectorAll('[data-price-count]')]
  .map((element) => ({
    element,
    target: Number(element.dataset.priceCount),
    finalText: element.textContent.trim()
  }))
  .filter(({ target }) => Number.isFinite(target) && target >= 0);

if (priceList && priceCounters.length && 'IntersectionObserver' in window && !reducedMotion.matches) {
  const formatter = new Intl.NumberFormat(isEnglish ? 'en-US' : 'ru-RU', {
    maximumFractionDigits: 0
  });
  const duration = 850;
  const countObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    countObserver.disconnect();

    const start = performance.now();
    const suffix = (text) => text.match(/\s*₽\s*$/)?.[0] || '';
    const counters = priceCounters.map((counter) => ({
      ...counter,
      suffix: suffix(counter.finalText)
    }));

    const step = (now) => {
      const progress = reducedMotion.matches ? 1 : Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      for (const { element, target, finalText, suffix: unit } of counters) {
        element.textContent = progress === 1
          ? finalText
          : `${formatter.format(Math.round(target * eased))}${unit}`;
      }
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, { threshold: 0.3 });
  countObserver.observe(priceList);
}

const lightbox = document.querySelector('.lightbox');
if (lightbox) {
  const lightboxImage = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('p');
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
      const figure = link.closest('figure');
      lightboxImage.src = link.href;
      lightboxImage.alt = link.querySelector('img')?.alt || '';
      lightboxCaption.textContent = figure?.querySelector('figcaption')?.textContent?.trim() || '';
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
