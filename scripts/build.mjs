import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
const publicUrl = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || null;
if (publicUrl && !/^https:\/\/[^/]+(?:\/.*)?$/.test(publicUrl)) {
  throw new Error('PUBLIC_SITE_URL must be an absolute HTTPS URL');
}

const mapUrl = 'https://yandex.ru/maps/?ll=40.421006%2C56.145343&pt=40.421006%2C56.145343&z=17';
const mapEmbed = 'https://yandex.ru/map-widget/v1/?ll=40.421006%2C56.145343&mode=whatshere&whatshere%5Bpoint%5D=40.421006%2C56.145343&z=17';
const phone = 'tel:+79040339177';
const telegram = 'https://t.me/khabiBarber';
const channel = 'https://t.me/khabiBarber13';

const content = {
  ru: {
    lang: 'ru', locale: 'ru_RU', path: '', altPath: 'en/', altLang: 'EN',
    title: 'Хабиб — барбер во Владимире | HABIB BARBER',
    description: 'Хабиб — независимый барбер во Владимире. Свяжитесь напрямую по телефону или в Telegram. Как найти: вход рядом с кафе «Юность».',
    nav: ['О Хабибе', 'Услуги', 'Работы', 'Как найти', 'Контакты'],
    menu: 'Меню', skip: 'К содержимому',
    eyebrow: 'Независимый барбер · Владимир',
    heroA: 'Стиль начинается', heroB: 'с человека.',
    heroText: 'Хабиб — независимый барбер во Владимире. Узнайте детали и договоритесь о визите напрямую.',
    contact: 'Связаться с Хабибом', route: 'Как найти', portraitAlt: 'Портрет Хабиба в барбершопе',
    portraitCaption: 'Хабиб / Владимир', scroll: 'Листайте вниз',
    aboutKicker: '01 / Знакомство', aboutTitle: 'Ваш барбер — Хабиб.',
    aboutText: 'Личный контакт важен с самого начала. Напишите Хабибу, чтобы обсудить желаемый результат, стоимость и удобное время.',
    aboutAside: 'Один мастер. Прямой разговор. Ваше решение.',
    servicesKicker: '02 / Перед визитом', servicesTitle: 'Услуги и стоимость',
    servicesIntro: 'Актуальные детали лучше уточнить у Хабиба напрямую. Подтверждённый список услуг и прайс появятся здесь после согласования.',
    serviceRows: [
      ['Услуги', 'Список уточняется'],
      ['Стоимость', 'Уточните перед визитом'],
      ['Время', 'Согласуйте напрямую']
    ],
    askDetails: 'Уточнить детали в Telegram',
    portfolioKicker: '03 / Портфолио', portfolioTitle: 'Работы Хабиба',
    portfolioText: 'Здесь появятся фотографии реальных работ после согласования с Хабибом. Пока вы можете познакомиться с ним по портрету и связаться напрямую.',
    portfolioEmpty: 'Реальные работы / скоро',
    channel: 'Telegram-канал Хабиба',
    locationKicker: '04 / Место', locationTitle: 'Найти просто.',
    locationCity: 'Владимир', locationLandmark: 'Вход рядом с кафе «Юность».',
    locationNote: 'Точный почтовый адрес уточняется. Перед визитом подтвердите маршрут у Хабиба.',
    mapTitle: 'Карта расположения Хабиба во Владимире', openMap: 'Открыть Яндекс Карты',
    showMap: 'Показать карту',
    contactsKicker: '05 / Контакт', contactsTitle: 'Давайте обсудим ваш визит.',
    contactsText: 'Напишите в Telegram или позвоните Хабибу, чтобы уточнить услугу, цену и время.',
    call: 'Позвонить', write: 'Написать в Telegram',
    footerNote: 'Независимый барбер во Владимире.', language: 'Язык',
    schemaDescription: 'Независимый барбер во Владимире. Связь и согласование визита напрямую.'
  },
  en: {
    lang: 'en', locale: 'en_US', path: 'en/', altPath: '', altLang: 'RU',
    title: 'Habib — barber in Vladimir | HABIB BARBER',
    description: 'Habib is an independent barber in Vladimir, Russia. Contact him directly by phone or Telegram. Entrance next to Yunost café.',
    nav: ['About', 'Services', 'Work', 'Location', 'Contact'],
    menu: 'Menu', skip: 'Skip to content',
    eyebrow: 'Independent barber · Vladimir',
    heroA: 'Style starts', heroB: 'with you.',
    heroText: 'Habib is an independent barber in Vladimir. Ask about the details and arrange your visit directly.',
    contact: 'Contact Habib', route: 'Find the studio', portraitAlt: 'Portrait of Habib in a barbershop',
    portraitCaption: 'Habib / Vladimir', scroll: 'Scroll to explore',
    aboutKicker: '01 / Introduction', aboutTitle: 'Meet your barber, Habib.',
    aboutText: 'A direct conversation is the best place to start. Message Habib to discuss the result you want, the price and a convenient time.',
    aboutAside: 'One barber. A direct conversation. Your choice.',
    servicesKicker: '02 / Before your visit', servicesTitle: 'Services & pricing',
    servicesIntro: 'Please ask Habib for current details. The confirmed service list and prices will be added here once approved.',
    serviceRows: [
      ['Services', 'List to be confirmed'],
      ['Prices', 'Ask before your visit'],
      ['Availability', 'Arrange directly']
    ],
    askDetails: 'Ask on Telegram',
    portfolioKicker: '03 / Portfolio', portfolioTitle: 'Habib’s work',
    portfolioText: 'Photos of Habib’s actual work will be added here once approved. For now, meet him through his portrait and get in touch directly.',
    portfolioEmpty: 'Actual work / coming soon',
    channel: 'Habib’s Telegram channel',
    locationKicker: '04 / Location', locationTitle: 'Easy to find.',
    locationCity: 'Vladimir, Russia', locationLandmark: 'Entrance next to Yunost café.',
    locationNote: 'The exact street address is being confirmed. Please check directions with Habib before visiting.',
    mapTitle: 'Map showing Habib’s location in Vladimir', openMap: 'Open Yandex Maps',
    showMap: 'Show map',
    contactsKicker: '05 / Contact', contactsTitle: 'Let’s plan your visit.',
    contactsText: 'Message or call Habib to confirm the service, price and time.',
    call: 'Call Habib', write: 'Message on Telegram',
    footerNote: 'Independent barber in Vladimir.', language: 'Language',
    schemaDescription: 'Independent barber in Vladimir, Russia. Contact and visit arrangements are made directly.'
  }
};

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const base = (lang) => lang === 'ru' ? './' : '../';
const urlFor = (path) => `${publicUrl}/${path}`;

function page(c) {
  const rootPath = base(c.lang);
  const canonical = publicUrl ? urlFor(c.path) : '';
  const alternate = publicUrl ? `
  <link rel="canonical" href="${escape(canonical)}">
  <link rel="alternate" hreflang="ru" href="${escape(urlFor(''))}">
  <link rel="alternate" hreflang="en" href="${escape(urlFor('en/'))}">
  <link rel="alternate" hreflang="x-default" href="${escape(urlFor(''))}">` : '<meta name="robots" content="noindex, nofollow">';
  const schema = {
    '@context': 'https://schema.org', '@type': 'BarberShop',
    name: 'HABIB BARBER', description: c.schemaDescription,
    telephone: '+79040339177',
    address: {'@type':'PostalAddress', addressLocality: 'Vladimir', addressCountry: 'RU'},
    geo: {'@type':'GeoCoordinates', latitude: 56.145343, longitude: 40.421006},
    hasMap: mapUrl, sameAs: [telegram, channel],
    ...(publicUrl ? {url: canonical} : {})
  };
  const navLinks = ['about','services','work','location','contact'].map((id, index) => `<a href="#${id}">${escape(c.nav[index])}</a>`).join('');
  const rows = c.serviceRows.map(([name, value], index) => `<div class="service-row"><span class="service-index">0${index + 1}</span><h3>${escape(name)}</h3><p>${escape(value)}</p><span class="service-arrow" aria-hidden="true">→</span></div>`).join('');
  return `<!doctype html>
<html lang="${c.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#141613">
  <meta name="description" content="${escape(c.description)}">
  <title>${escape(c.title)}</title>${alternate}
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${c.locale}">
  <meta property="og:title" content="${escape(c.title)}">
  <meta property="og:description" content="${escape(c.description)}">
  <meta property="og:image" content="${escape(publicUrl ? urlFor('images/habib-portrait.webp') : `${rootPath}images/habib-portrait.webp`)}">
  ${publicUrl ? `<meta property="og:url" content="${escape(canonical)}">` : ''}
  <link rel="icon" type="image/svg+xml" href="${rootPath}favicon.svg">
  <link rel="preload" as="image" href="${rootPath}images/habib-portrait.webp" fetchpriority="high">
  <link rel="stylesheet" href="${rootPath}assets/site.css">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body>
  <a class="skip-link" href="#main">${escape(c.skip)}</a>
  <header class="site-header">
    <div class="shell header-inner">
      <a class="brand" href="#top" aria-label="HABIB BARBER"><span class="brand-mark" aria-hidden="true">H<span class="brand-slash">/</span>B</span><span class="brand-name">HABIB <b>BARBER</b></span></a>
      <nav class="desktop-nav" aria-label="${escape(c.menu)}">${navLinks}</nav>
      <div class="header-actions"><a class="lang-link" href="${rootPath}${c.altPath}" lang="${c.lang === 'ru' ? 'en' : 'ru'}" aria-label="${escape(c.language)}: ${c.altLang}">${c.altLang}</a><a class="header-contact" href="${telegram}" target="_blank" rel="noopener noreferrer">${escape(c.contact)} <span aria-hidden="true">→</span></a></div>
      <details class="mobile-menu"><summary>${escape(c.menu)}<span aria-hidden="true" class="menu-icon"><i></i><i></i></span></summary><nav aria-label="${escape(c.menu)}">${navLinks}</nav></details>
    </div>
  </header>
  <main id="main">
    <section class="hero" id="top" aria-labelledby="hero-title">
      <div class="shell hero-grid">
        <div class="hero-content"><p class="eyebrow"><span class="eyebrow-line"></span>${escape(c.eyebrow)}</p><h1 id="hero-title">${escape(c.heroA)} <em>${escape(c.heroB)}</em></h1><p class="hero-copy">${escape(c.heroText)}</p><div class="hero-actions"><a class="button button-primary" href="${telegram}" target="_blank" rel="noopener noreferrer">${escape(c.contact)} <span aria-hidden="true">→</span></a><a class="text-link" href="#location">${escape(c.route)} <span aria-hidden="true">→</span></a></div><div class="hero-bottom"><span>56°08′43″ N<br>40°25′16″ E</span><a href="#about">${escape(c.scroll)} <span aria-hidden="true">↓</span></a></div></div>
        <div class="hero-visual"><div class="portrait-frame"><img src="${rootPath}images/habib-portrait.webp" width="400" height="400" alt="${escape(c.portraitAlt)}" decoding="async" fetchpriority="high"><span class="portrait-frame-line" aria-hidden="true"></span></div><div class="portrait-label"><span class="portrait-no">01 / 01</span><span>${escape(c.portraitCaption)}</span></div><span class="vertical-word" aria-hidden="true">HABIB BARBER</span></div>
      </div>
      <div class="hero-ticker" aria-hidden="true"><div class="shell"><span>HABIB BARBER</span><span class="ticker-star">+</span><span>VLADIMIR</span><span class="ticker-star">+</span><span>ONE BARBER</span></div></div>
    </section>
    <section class="section about-section" id="about" aria-labelledby="about-title"><div class="shell about-grid"><p class="section-kicker">${escape(c.aboutKicker)}</p><div><h2 id="about-title" class="display-title">${escape(c.aboutTitle)}</h2><p class="lead-copy">${escape(c.aboutText)}</p></div><p class="about-aside">${escape(c.aboutAside)}</p></div></section>
    <section class="section services-section" id="services" aria-labelledby="services-title"><div class="shell"><div class="section-heading"><div><p class="section-kicker">${escape(c.servicesKicker)}</p><h2 id="services-title" class="display-title">${escape(c.servicesTitle)}</h2></div><p>${escape(c.servicesIntro)}</p></div><div class="service-list">${rows}</div><a class="text-link section-link" href="${telegram}" target="_blank" rel="noopener noreferrer">${escape(c.askDetails)} <span aria-hidden="true">→</span></a></div></section>
    <section class="section portfolio-section" id="work" aria-labelledby="work-title"><div class="shell portfolio-grid"><div class="portfolio-copy"><p class="section-kicker">${escape(c.portfolioKicker)}</p><h2 id="work-title" class="display-title">${escape(c.portfolioTitle)}</h2><p>${escape(c.portfolioText)}</p><a class="text-link section-link" href="${channel}" target="_blank" rel="noopener noreferrer">${escape(c.channel)} <span aria-hidden="true">→</span></a></div><div class="portfolio-placeholder" role="img" aria-label="${escape(c.portfolioEmpty)}"><span class="placeholder-top">HB <span>©</span></span><span class="placeholder-circle" aria-hidden="true"></span><span class="placeholder-bottom">${escape(c.portfolioEmpty)}</span></div></div></section>
    <section class="section location-section" id="location" aria-labelledby="location-title"><div class="shell location-grid"><div class="location-copy"><p class="section-kicker">${escape(c.locationKicker)}</p><h2 id="location-title" class="display-title">${escape(c.locationTitle)}</h2><p class="location-city">${escape(c.locationCity)}</p><p class="location-landmark">${escape(c.locationLandmark)}</p><p class="location-note">${escape(c.locationNote)}</p><a class="button button-outline" href="${mapUrl}" target="_blank" rel="noopener noreferrer">${escape(c.openMap)} <span aria-hidden="true">→</span></a></div><div class="map-wrap"><div class="map-preview" aria-hidden="true"><span class="map-preview-top">VLADIMIR / 56.145343° N</span><span class="map-pin"></span><span class="map-preview-bottom">40.421006° E / HABIB BARBER</span></div><details class="map-reveal"><summary>${escape(c.showMap)} <span aria-hidden="true">→</span></summary><iframe title="${escape(c.mapTitle)}" src="${mapEmbed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></details></div></div></section>
    <section class="contact-section" id="contact" aria-labelledby="contact-title"><div class="shell contact-grid"><div><p class="section-kicker">${escape(c.contactsKicker)}</p><h2 id="contact-title" class="display-title">${escape(c.contactsTitle)}</h2><p>${escape(c.contactsText)}</p></div><div class="contact-actions"><a class="contact-link" href="${telegram}" target="_blank" rel="noopener noreferrer"><span>Telegram</span><span aria-hidden="true">→</span></a><a class="contact-link" href="${phone}"><span>+7 904 033 9177</span><span aria-hidden="true">→</span></a></div></div></section>
  </main>
  <footer class="site-footer"><div class="shell footer-grid"><a class="brand footer-brand" href="#top" aria-label="HABIB BARBER"><span class="brand-mark" aria-hidden="true">H<span class="brand-slash">/</span>B</span><span class="brand-name">HABIB <b>BARBER</b></span></a><p>${escape(c.footerNote)}</p><a href="${rootPath}${c.altPath}" lang="${c.lang === 'ru' ? 'en' : 'ru'}">${c.altLang} →</a><span>© ${new Date().getFullYear()} HABIB BARBER</span></div></footer>
  <script src="${rootPath}assets/site.js" defer></script>
</body>
</html>`;
}

await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'en'), { recursive: true });
await cp(resolve(root, 'public'), out, { recursive: true });
await writeFile(resolve(out, 'index.html'), page(content.ru));
await writeFile(resolve(out, 'en/index.html'), page(content.en));
await writeFile(resolve(out, 'robots.txt'), publicUrl ? `User-agent: *\nAllow: /\nSitemap: ${urlFor('sitemap.xml')}\n` : 'User-agent: *\nDisallow: /\n');
if (publicUrl) {
  await writeFile(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(urlFor(''))}</loc></url><url><loc>${escape(urlFor('en/'))}</loc></url></urlset>\n`);
}
console.log(`Built ${out}${publicUrl ? ` for ${publicUrl}` : ' as a noindex preview'}`);
