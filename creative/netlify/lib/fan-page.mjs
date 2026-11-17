import { createHash } from 'node:crypto';
import { LABELS } from './smart-links.mjs';

/**
 * The fan page of a smart link (/l/<slug>): one small HTML page, no framework and no requests of its own but the cover and the
 * preview, so it opens at once inside Instagram's and TikTok's browsers. The buttons are plain https links in the same window:
 * that is what lets iOS and Android hand them to the Spotify or Apple Music app.
 */

/** Which cached page to drop when its link is published, changed or deleted (`forgetFanPage` in links.mjs). */
export const cacheTag = (slug) => `link-${slug}`;

const COLOURS = {
  spotify: '#1ed760', apple: '#fa2d48', youtube: '#ff0033', youtubeMusic: '#ff0033',
  deezer: '#a238ff', tidal: '#ffffff', soundcloud: '#ff5500', amazon: '#25d1da',
};

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** A URL inside CSS url('…'): the characters that could end it are encoded (the URL is already a checked https link). */
const cssUrl = (url) => esc(url.replace(/['"()\\\s]/g, c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`));

const PLAYER = "var a=document.getElementById('a'),b=document.getElementById('p');"
  + "b.onclick=function(){a.paused?a.play():a.pause()};"
  + "a.onplay=function(){b.className='on';b.setAttribute('aria-label','Pause preview')};"
  + "a.onpause=a.onended=function(){b.className='';b.setAttribute('aria-label','Play preview')};";
const PLAYER_HASH = createHash('sha256').update(PLAYER).digest('base64');

/** Only the cover, the preview and our one script may load; nothing may frame the page. */
export const POLICY = `default-src 'none'; img-src https:; media-src https:; style-src 'unsafe-inline'; script-src 'sha256-${PLAYER_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const STYLE = `*{box-sizing:border-box}html{background:#0b0b0b;color:#fff;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;overflow-x:hidden}
.bg{position:fixed;inset:-40px;background:center/cover no-repeat;filter:blur(40px) brightness(.45) saturate(1.3);transform:scale(1.15);z-index:-1}
main{width:100%;max-width:420px;padding:32px 20px 16px;display:flex;flex-direction:column;align-items:center;gap:12px}
.art{position:relative;width:min(72vw,280px);aspect-ratio:1;border-radius:10px;overflow:hidden;background:#222;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.art img{width:100%;height:100%;object-fit:cover;display:block}
#p{position:absolute;right:12px;bottom:12px;width:52px;height:52px;border:0;border-radius:50%;background:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
#p::before{content:"";position:absolute;left:21px;top:16px;border-style:solid;border-width:10px 0 10px 16px;border-color:transparent transparent transparent #000}
#p.on::before{left:18px;top:17px;width:5px;height:18px;border:0;background:#000;box-shadow:11px 0 #000}
h1{margin:8px 0 0;font-size:24px;line-height:1.2;text-align:center;letter-spacing:-.02em}
.by{margin:0;color:rgba(255,255,255,.7);text-align:center}
ul{list-style:none;margin:12px 0 0;padding:0;width:100%;display:flex;flex-direction:column;gap:10px}
a.s{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;text-decoration:none;font-weight:600;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
a.s:hover,a.s:focus-visible{background:rgba(255,255,255,.18)}a.s:focus-visible{outline:2px solid #fff;outline-offset:2px}
a.s i{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}a.s span{flex:1}
a.s em{font-style:normal;font-size:13px;padding:5px 12px;border-radius:999px;background:#fff;color:#000}
footer{margin-top:auto;padding:24px 0 28px;font-size:13px}footer a{color:rgba(255,255,255,.6);text-decoration:none}footer b{color:#fff}`;

/**
 * The page for a published link. `link` is as `cleanLink` keeps it; `address` is the page's own URL, for sharing previews.
 * `home` is our site, for the footer credit.
 */
export function fanPage(link, address, home) {
  const title = esc(link.title);
  const artist = esc(link.artist);
  const shown = link.services.filter(row => !row.hidden);
  const names = shown.map(row => LABELS[row.service]);
  const description = esc(`Listen to ${link.title} by ${link.artist} on ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`);
  const cover = link.cover ? esc(link.cover) : '';
  const buttons = shown.map(row => `<li><a class="s" href="${esc(row.url)}" style="--c:${COLOURS[row.service]}"><i></i><span>${esc(LABELS[row.service])}</span><em>${row.service === 'youtube' ? 'Watch' : 'Play'}</em></a></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${artist}</title><meta name="description" content="${description}"><link rel="canonical" href="${esc(address)}">
<meta property="og:type" content="music.song"><meta property="og:title" content="${title} · ${artist}"><meta property="og:description" content="${description}"><meta property="og:url" content="${esc(address)}">${cover ? `<meta property="og:image" content="${cover}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#0b0b0b"><style>${STYLE}</style></head><body>
${cover ? `<div class="bg" style="background-image:url('${cssUrl(link.cover)}')"></div>` : ''}<main><div class="art">${cover ? `<img src="${cover}" alt="${title} cover" width="280" height="280" fetchpriority="high">` : ''}${link.preview ? '<button id="p" type="button" aria-label="Play preview"></button>' : ''}</div>
<h1>${title}</h1><p class="by">${artist}</p><ul>${buttons}</ul></main>
<footer><a href="${esc(home)}/links">Make your own free smart link · <b>mumoo</b></a></footer>${link.preview ? `<audio id="a" preload="none" src="${esc(link.preview)}"></audio><script>${PLAYER}</script>` : ''}
</body></html>`;
}

/** No link at this address (never published, or deleted). */
export function missingPage(home) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Link not found · mumoo</title><style>${STYLE}main{margin:auto;text-align:center}</style></head><body><main><h1>This link isn’t here</h1>
<p class="by">It may have been deleted, or the address has a typo.</p><ul><li><a class="s" href="${esc(home)}/links" style="--c:#2fe92b"><i></i><span>Make your own smart link</span><em>Free</em></a></li></ul></main></body></html>`;
}
