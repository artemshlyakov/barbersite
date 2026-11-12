import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const inputUrl = process.env.PUBLIC_SITE_URL?.trim();
let baseUrl = null;

if (inputUrl) {
  const parsed = new URL(inputUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_SITE_URL must be an absolute HTTPS URL without credentials, query or hash');
  }
  baseUrl = parsed.href.replace(/\/+$/, '') + '/';
}

const pages = [
  { source: 'index.html', output: 'index.html', lang: 'ru', path: '' },
  { source: 'en/index.html', output: 'en/index.html', lang: 'en', path: 'en/' }
];

const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const xmlEscape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const publicUrl = (path) => new URL(path, baseUrl).href;

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'en'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
await cp(resolve(root, 'styles.css'), resolve(output, 'styles.css'));
await cp(resolve(root, 'script.js'), resolve(output, 'script.js'));
await cp(resolve(root, '.nojekyll'), resolve(output, '.nojekyll'));

for (const page of pages) {
  let html = await readFile(resolve(root, page.source), 'utf8');
  if (!html.includes('<!-- PUBLIC_SEO -->')) throw new Error(`Missing SEO insertion point in ${page.source}`);

  if (baseUrl) {
    const url = publicUrl(page.path);
    const image = publicUrl('assets/habib.webp');
    const metadata = [
      `<link rel="canonical" href="${escapeAttribute(url)}">`,
      `<link rel="alternate" hreflang="ru" href="${escapeAttribute(publicUrl(''))}">`,
      `<link rel="alternate" hreflang="en" href="${escapeAttribute(publicUrl('en/'))}">`,
      `<link rel="alternate" hreflang="x-default" href="${escapeAttribute(publicUrl(''))}">`,
      `<meta property="og:url" content="${escapeAttribute(url)}">`,
      `<meta property="og:image" content="${escapeAttribute(image)}">`,
      `<meta property="og:image:width" content="640">`,
      `<meta property="og:image:height" content="640">`,
      `<meta property="og:image:alt" content="${page.lang === 'ru' ? 'Портрет Хабиба' : 'Portrait of Habib'}">`,
      '<meta name="twitter:card" content="summary_large_image">'
    ].join('\n  ');

    html = html.replace(/\s*<meta name="robots" content="noindex, nofollow"\s*\/?>/, '');
    html = html.replace('<!-- PUBLIC_SEO -->', metadata);
    html = html.replace(/(<script type="application\/ld\+json">)(.*?)(<\/script>)/s, (_, open, json, close) => {
      const data = JSON.parse(json);
      data.url = url;
      data.image = image;
      return open + JSON.stringify(data).replaceAll('<', '\\u003c') + close;
    });
  } else {
    html = html.replace('<!-- PUBLIC_SEO -->', '');
  }
  await writeFile(resolve(output, page.output), html);
}

if (baseUrl) {
  const urls = pages.map((page) => `  <url><loc>${xmlEscape(publicUrl(page.path))}</loc><xhtml:link rel="alternate" hreflang="ru" href="${xmlEscape(publicUrl(''))}"/><xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(publicUrl('en/'))}"/></url>`).join('\n');
  await writeFile(resolve(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
  await writeFile(resolve(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${publicUrl('sitemap.xml')}\n`);
} else {
  await cp(resolve(root, 'robots.txt'), resolve(output, 'robots.txt'));
}

console.log(baseUrl ? `Built public site for ${baseUrl}` : 'Built noindex preview');
