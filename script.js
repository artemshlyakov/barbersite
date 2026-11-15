const isEnglish = document.documentElement.lang === "en";
const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#navigation");

if (toggle && nav) {
  const labels = isEnglish
    ? { open: "Open menu", close: "Close menu" }
    : { open: "Открыть меню", close: "Закрыть меню" };

  const close = (restoreFocus = false) => {
    if (!nav.classList.contains("open")) return;
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", labels.open);
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? labels.close : labels.open);
  });
  nav
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => close()));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(true);
  });
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) close();
  });
}

if (nav && "IntersectionObserver" in window) {
  const sectionLinks = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const activeSection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        sectionLinks.forEach((link) => {
          if (link.getAttribute("href") === `#${entry.target.id}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
    },
    { rootMargin: "-35% 0px -55%" },
  );
  sections.forEach((section) => activeSection.observe(section));
}

const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

const header = document.querySelector(".site-header");
const bookingBar = document.querySelector(".mobile-booking");
const hero = document.querySelector(".hero");
const updateHeader = () =>
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
if (bookingBar && hero && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    bookingBar.classList.toggle("is-visible", !entry.isIntersecting);
  }).observe(hero);
}

const viewer = document.querySelector(".lightbox");
const galleryButtons = [...document.querySelectorAll("[data-gallery-open]")];
if (viewer && galleryButtons.length) {
  const image = viewer.querySelector("img");
  const caption = viewer.querySelector("figcaption");
  let selected = 0;
  let opener = null;

  const showImage = (index) => {
    selected = (index + galleryButtons.length) % galleryButtons.length;
    const source = galleryButtons[selected];
    const thumbnail = source.querySelector("img");
    image.src = thumbnail.currentSrc || thumbnail.src;
    image.alt = thumbnail.alt;
    caption.textContent = source
      .querySelector(".gallery-photo__caption")
      .textContent.trim();
  };

  galleryButtons.forEach((button, index) =>
    button.addEventListener("click", () => {
      opener = button;
      showImage(index);
      viewer.showModal();
    }),
  );
  viewer
    .querySelector("[data-gallery-close]")
    .addEventListener("click", () => viewer.close());
  viewer
    .querySelector("[data-gallery-prev]")
    .addEventListener("click", () => showImage(selected - 1));
  viewer
    .querySelector("[data-gallery-next]")
    .addEventListener("click", () => showImage(selected + 1));
  viewer.addEventListener("close", () => opener?.focus());
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showImage(selected - 1);
    if (event.key === "ArrowRight") showImage(selected + 1);
  });
}

const mapElement = document.querySelector("[data-map]");
if (mapElement && window.L) {
  const showMap = () => {
    mapElement.querySelector(".map-fallback")?.remove();
    const point = [56.145343, 40.421006];
    const map = L.map(mapElement, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: false,
    }).setView(point, 16);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.marker(point, {
      icon: L.divIcon({
        className: "map-pin",
        html: '<span aria-hidden="true"></span>',
        iconSize: [30, 39],
        iconAnchor: [15, 39],
      }),
      keyboard: false,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(map);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        showMap();
      },
      { rootMargin: "300px" },
    );
    observer.observe(mapElement);
  } else {
    showMap();
  }
}
