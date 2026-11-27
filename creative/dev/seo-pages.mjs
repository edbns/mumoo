import { readFileSync } from 'node:fs';
import { thisSite } from '../netlify/lib/sites.mjs';
import { QUESTIONS } from '../src/pricing-faq.mjs';

const HOME = 'https://mumoo.app';
const LEGAL = ['terms-of-service', 'privacy-policy', 'cookie-policy', 'acceptable-use-policy', 'refund-policy', 'ai-disclosure', 'data-processing-agreement'];
/** The pages search engines are given (the live site's sitemap). */
export const PUBLIC_PATHS = ['/', '/pricing', '/smart-links', '/legal', ...LEGAL.map(slug => `/${slug}`)];

const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = line => line.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
const cut = (text, most = 155) => text.length <= most ? text : `${text.slice(0, most - 1).replace(/\s+\S*$/, '')}…`;

/** A legal document's title (its first heading) and description (its first plain paragraph). */
export function legalHead(slug, source = readFileSync(new URL(`../legal/${slug}.md`, import.meta.url), 'utf8')) {
  const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
  const title = plain(lines.find(line => line.startsWith('# ')).slice(2));
  const section = lines.findIndex((line, at) => at > 0 && line.startsWith('#'));
  const first = lines.slice(1, section === -1 ? undefined : section).find(line => !/^(\*\*|-|\d+\.|---)/.test(line));
  return { title: `${title} · mumoo`, description: cut(first ? plain(first) : `${title} for mumoo, the music promo video maker for Reels, TikTok, and Shorts.`) };
}

/** The page's own title, description, canonical address and sharing preview, in place of the ones its HTML came with. */
export function withHead(html, { title, description, path, robots = null }) {
  const url = `${HOME}${path}`;
  const tags = [
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">', '<meta property="og:site_name" content="mumoo">',
    `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${HOME}/og-cover.png">`,
    '<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:image" content="${HOME}/og-cover.png">`,
    ...(robots ? [`<meta name="robots" content="${robots}">`] : []),
  ].join('\n');
  return html
    .replace(/<meta name="(description|robots)"[^>]*>\n?|<link rel="canonical"[^>]*>\n?|<meta (property|name)="(og|twitter):[^>]*>\n?/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>\n${tags}`);
}

/** The pricing questions as Google's FAQ. */
export const faqJson = () => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: QUESTIONS.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}).replace(/</g, '\\u003c');

/** Only the live site is for search engines; staging and every other deploy is kept out of them. */
export function crawlFiles(live) {
  if (!live) return { 'robots.txt': 'User-agent: *\nDisallow: /\n', _headers: '/*\n  X-Robots-Tag: noindex, nofollow\n' };
  return {
    'robots.txt': `User-agent: *\nDisallow: /admin\nDisallow: /phone\nDisallow: /api/\nDisallow: /render\n\nSitemap: ${HOME}/sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map(path => `  <url><loc>${HOME}${path === '/' ? '/' : path}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
}

export const SMART_LINKS_HEAD = {
  title: 'Free Music Smart Links for Spotify, Apple Music & YouTube | mumoo',
  description: 'Create a free smart link for your song in seconds. One shareable link for Spotify, Apple Music, YouTube, and Deezer with real-time click tracking.',
  path: '/smart-links',
};

/**
 * Search engines read a page's head before its script runs, so each public address gets its own at build: the smart links editor
 * and every legal document as their own HTML file (netlify.toml sends each address to it), the pricing FAQ, and the crawl files.
 */
export function seoPages() {
  return {
    name: 'seo-pages',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (context.filename.endsWith('pricing.html')) return html.replace('</head>', `<script type="application/ld+json">${faqJson()}</script>\n</head>`);
        if (context.filename.endsWith('/index.html')) return html.replace('</title>', '</title>\n<meta name="robots" content="noindex">');
        return html;
      },
    },
    generateBundle(_options, bundle) {
      const source = name => { const file = bundle[name]; return file?.type === 'asset' ? String(file.source) : null; };
      const app = source('index.html');
      const legal = source('legal.html');
      if (app) this.emitFile({ type: 'asset', fileName: 'smart-links.html', source: withHead(app, SMART_LINKS_HEAD) });
      if (legal) {
        for (const slug of LEGAL) this.emitFile({ type: 'asset', fileName: `${slug}.html`, source: withHead(legal, { ...legalHead(slug), path: `/${slug}` }) });
        bundle['legal.html'].source = withHead(legal, { title: 'Legal · mumoo', description: 'The terms and policies for using mumoo: terms of service, privacy, cookies, acceptable use, refunds, and AI disclosure.', path: '/legal' });
      }
      for (const [fileName, text] of Object.entries(crawlFiles(thisSite()?.name === 'live'))) this.emitFile({ type: 'asset', fileName, source: text });
    },
  };
}
