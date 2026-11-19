// Lists every text people read into copy/USER-TEXT.md (run from creative/: node copy/extract-user-text.mjs copy/USER-TEXT.md copy/user-text-key.json).
import ts from 'typescript';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const UI_KEYS = new Set(['label', 'title', 'description', 'reason', 'lead', 'text', 'placeholder', 'hint', 'aria-label', 'alt', 'q', 'a', 'error',
  'message', 'note', 'confirmLabel', 'cancelLabel', 'closeLabel', 'buttonLabel', 'inputLabel', 'removeLabel', 'emptyMessage', 'caption', 'heading',
  'subject', 'body', 'preview', 'aside', 'tooltip', 'eyebrow', 'cta', 'button', 'detail', 'summary']);
const SKIP_ATTRS = new Set(['className', 'key', 'href', 'src', 'type', 'id', 'role', 'variant', 'side', 'align', 'style', 'accept', 'autoComplete',
  'inputMode', 'rel', 'target', 'method', 'size', 'mode', 'kind', 'value', 'name', 'htmlFor', 'form', 'loading', 'decoding', 'fetchPriority', 'as', 'lang',
  'd', 'viewBox', 'fill', 'stroke', 'transform', 'path', 'download', 'pattern', 'enterKeyHint', 'sizes', 'srcSet', 'media', 'icon']);
const SKIP_CALLS = /^(console\.\w+|fetch|accountFetch|URL|localStorage\.\w+|sessionStorage\.\w+|document\.\w+|import|require|setTimeout|classList\.\w+|cn|clsx|twMerge|cva|querySelector\w*|addEventListener|removeEventListener|dispatchEvent|CustomEvent|Event|matchMedia|getItem|setItem|removeItem|sql|query|log|warn|debug|startsWith|endsWith|includes|split|replace|replaceAll|match|test|padStart|join|getElementById|setAttribute|getAttribute|createElement|postMessage|navigate|redirect|set|get|has|append|delete|toLocaleString|toLocaleDateString|Intl\.\w+|DateTimeFormat|NumberFormat|RegExp|BroadcastChannel|Blob|File|Worker|FontFace|Image|Audio)$/;
const INLINE_TAGS = new Set(['a', 'strong', 'em', 'b', 'i', 'span', 'code', 'br', 'kbd', 'mark', 'small', 'abbr', 'time']);

function prose(text, ui) {
  const t = text.trim();
  const outside = t.replace(/\{[^{}]*\}/g, '');
  if (!/[A-Za-z]{2}/.test(outside)) return false;
  if (/^(https?:|mailto:|\/|\.|#|@|data:|image\/|audio\/|video\/|application\/|text\/|M\d)/.test(t)) return false;
  if (/\b(size|gap|flex|inline|items|justify|transition|rotate|px|py|pt|pb|mt|mb|bg|rounded|grid|w|h|max-w|min-h|opacity|duration|shadow|ring|border|font)-|color-mix|rotateX|minmax|repeat\(|var\(--/.test(t)) return false;
  if (/\b(select|insert into|update|delete from)\b/i.test(t) && /\b(from|values|set|where|returning)\b/i.test(t)) return false;
  if (/^[a-z0-9_.:\-\/\[\]#%()!>~*+=&,|]+( [a-z0-9_.:\-\/\[\]#%()!>~*+=&,@|]+)*$/.test(t) && !/^[a-z]+( [a-z’']+){2,}[.?!]?$/.test(t)) return false;
  if (/^[A-Z_][A-Z0-9_]*$/.test(t) && t.length > 5) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Bearer|Content-Type|Authorization|Accept|Cache-Control|X-[\w-]+|utf-8|UTF-8)$/i.test(t)) return false;
  if (/^[\w-]+$/.test(t)) return ui && /^[A-Z0-9]/.test(t);
  return ui || /^[A-Z0-9“"'‘(…$+—–]/.test(t) || /[.?!:…]$/.test(t);
}

/** An expression shown inside a sentence: a plain name is kept so the writer knows what goes there, anything else becomes {…}. */
function slot(expression, source) {
  const code = expression.getText(source);
  return /^[\w.]+$/.test(code) ? `{${code.split('.').pop()}}` : /^[\w.]+\([\w.]*\)$/.test(code) ? `{${code.replace(/\(.*$/, '')}}` : '{…}';
}

function contextOf(node) {
  for (let at = node.parent, depth = 0; at && depth < 8; at = at.parent, depth++) {
    if (ts.isImportDeclaration(at) || ts.isExportDeclaration(at) || ts.isLiteralTypeNode(at)) return [true, false];
    if (ts.isJsxAttribute(at)) {
      const name = at.name.getText();
      if (SKIP_ATTRS.has(name) || (/^(data-|on[A-Z])/.test(name))) return [true, false];
      return [false, true];
    }
    if (ts.isPropertyAssignment(at) && depth <= 3) {
      const name = at.name.getText().replace(/['"]/g, '');
      if (UI_KEYS.has(name)) return [false, true];
      if (/^(className|class|key|id|type|href|url|path|method|headers|kind|status|code|slug|sql|cache|mode|credentials|redirect|accept|event|channel|icon|variant|align|side|tone|from|to|replyTo|tag|tags|genre|style|font|family|color|colour|background|cursor|transition|ease|name|value|line)$/.test(name)) return [true, false];
    }
    if (ts.isCallExpression(at) || ts.isNewExpression(at)) {
      const callee = at.expression.getText();
      if (SKIP_CALLS.test(callee) || SKIP_CALLS.test(callee.split('.').pop())) return [true, false];
      return [false, /Error$|^(askSignIn|set\w*|fail|notice|friendly|say|json|Response\.json|send|reply|problem|bad|deny|refuse)/i.test(callee.split('.').pop()) || /Error$/.test(callee)];
    }
    if (ts.isJsxExpression(at) || ts.isJsxElement(at)) return [false, true];
    if (ts.isBinaryExpression(at) && /^(===|!==|==|!=|in|instanceof)$/.test(at.operatorToken.getText())) return [true, false];
    if (ts.isCaseClause(at) || ts.isElementAccessExpression(at) || ts.isTypeReferenceNode(at) || ts.isUnionTypeNode(at)) return [true, false];
  }
  return [false, false];
}

function extract(file) {
  const code = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, /x$|\.mjs$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const consumed = new Set();
  const add = (node, text, ui) => {
    const clean = text.replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && prose(clean, ui)) found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: clean });
  };
  const tagOf = element => (ts.isJsxElement(element) ? element.openingElement.tagName.getText(source) : ts.isJsxSelfClosingElement(element) ? element.tagName.getText(source) : '');
  /** A run of JSX children as one sentence: text, inline tags read through, expressions as slots. */
  const sentence = children => children.map(child => {
    if (ts.isJsxText(child)) { consumed.add(child); return child.text; }
    if (ts.isJsxExpression(child)) return child.expression && !ts.isStringLiteral(child.expression) ? slot(child.expression, source) : child.expression?.text ?? '';
    if (INLINE_TAGS.has(tagOf(child))) return ts.isJsxElement(child) ? sentence(child.children) : tagOf(child) === 'br' ? ' ' : '';
    return '\u0000';
  }).join('');
  const visit = node => {
    if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && node.children.some(child => ts.isJsxText(child) && child.text.trim())) {
      for (const part of sentence(node.children).split('\u0000')) add(node, part, true);
    }
    if (ts.isJsxText(node) && !consumed.has(node)) add(node, node.text, true);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const [skip, ui] = contextOf(node);
      if (!skip) {
        const text = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(span => slot(span.expression, source) + span.literal.text).join('') : node.text;
        add(node, text, ui);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const seen = new Set();
  return found.filter(({ text }) => !seen.has(text) && seen.add(text));
}

const PAGES = [
  ['Everywhere: top bar, account menu, sign-in, cookies, footer, popups', ['src/account.tsx', 'src/account-hint.tsx', 'src/account-pages.ts', 'src/components/ui/user-dropdown-menu.tsx',
    'src/sign-in-dialog.tsx', 'src/components/ui/magic-link-otp-login.tsx', 'src/components/ui/cookie-consent.tsx', 'src/legal-corner.tsx', 'src/crash-guard.tsx',
    'src/friendly-error.ts', 'src/step-nav.tsx', 'src/profile-nav.tsx', 'src/components/ui/modal.tsx', 'src/components/ui/action-dialog.tsx', 'src/components/ui/combobox.tsx',
    'src/components/ui/file-dropzone.tsx', 'src/components/ui/file-dropzone-utils/use-file-upload.tsx', 'src/account-section.tsx', 'src/loading-mask.tsx',
    'src/render-progress.tsx', 'src/components/ui/progressive-flux-loader.tsx', 'src/staging-access.tsx']],
  ['Create, step 1 and 2: song upload, kind of music, clip and lyrics', ['src/main.tsx', 'src/audio.ts', 'src/audio-format.ts', 'src/composition.ts', 'src/clip-picker.tsx',
    'src/waveform.tsx', 'src/lyrics-studio.tsx', 'src/lyrics-cloud.ts', 'src/phone-upload.tsx', 'src/music-analysis-runner.tsx', 'src/style-print-runner.tsx', 'src/lyric-meaning-cloud.ts']],
  ['Create, step 3: analysing screen', ['src/analyzing-screen.tsx', 'src/music-intent.ts']],
  ['Create, step 4: creatives (the shelf of videos)', ['src/creatives-pack-studio.tsx', 'src/picture-upload.tsx', 'src/photo-shrink.ts', 'src/uploads.ts', 'src/use-uploads.ts',
    'src/pack-renderer.ts', 'src/pack-cloud-export.ts', 'src/pack-feedback.ts']],
  ['Chosen videos: the bottom bar, the chosen videos page, making the videos', ['src/cart-panel.tsx', 'src/cart.ts', 'src/use-cart-download.ts']],
  ['Credits popup, purchase and invite friends', ['src/purchase-credits.tsx', 'src/components/ui/pricing-interaction.tsx', 'src/credit-packs.ts', 'src/invite-friends.tsx', 'src/referral.ts']],
  ['Pricing page (/pricing)', ['src/pricing-page.tsx']],
  ['Profile: History (Media and Uploads)', ['src/history-page.tsx', 'src/lazy-media.tsx']],
  ['Profile: Settings', ['src/settings-page.tsx']],
  ['Profile: Invoices', ['src/invoices-page.tsx']],
  ['Smart links: Create Smart Link', ['src/links-page.tsx', 'src/links-skeleton.tsx', 'src/smart-link-cta.tsx', 'src/smart-link-parts.tsx', 'src/smart-links.ts', 'src/ad-tracking.tsx']],
  ['Smart links: My Smart Links and analytics', ['src/my-links-page.tsx', 'src/link-analytics.tsx']],
  ['Phone upload page (opened from the QR code)', ['src/phone/main.tsx']],
  ['Welcome page', ['src/welcome-page.tsx']],
  ['Legal page frame (not the legal texts themselves)', ['src/legal-page.tsx']],
  ['Public smart link page (what fans see)', ['netlify/lib/fan-page.mjs', 'netlify/functions/fan-page.mjs']],
  ['Emails', ['netlify/lib/letters.mjs', 'netlify/lib/mail.mjs', 'netlify/functions/auth-email.mjs', 'netlify/functions/account-email.mjs', 'netlify/lib/email-change.mjs', 'netlify/lib/storage-warning.mjs', 'netlify/lib/inactivity.mjs']],
  ['Messages from the server (shown when something goes wrong)', ['netlify/functions/account/account.mjs', 'netlify/functions/checkout.mjs', 'netlify/functions/referral.mjs',
    'netlify/functions/encode-creative.mjs', 'netlify/functions/encode-creative-status.mjs', 'netlify/functions/renders/renders.mjs', 'netlify/functions/uploads/uploads.mjs',
    'netlify/lib/uploads.mjs', 'netlify/lib/storage.mjs', 'netlify/lib/prepare.mjs', 'netlify/lib/reel.mjs', 'netlify/lib/render-media.mjs', 'netlify/functions/invoices.mjs',
    'netlify/functions/links.mjs', 'netlify/functions/links-lookup.mjs', 'netlify/functions/links-search.mjs', 'netlify/functions/links-slug.mjs', 'netlify/functions/links-stats.mjs',
    'netlify/lib/smart-links.mjs', 'netlify/functions/phone-handoff.mjs', 'netlify/functions/analyze-music.mjs', 'netlify/functions/transcribe-lyrics.mjs',
    'netlify/functions/transcribe-lyrics-status.mjs', 'netlify/functions/read-lyric-meaning.mjs', 'netlify/functions/read-lyric-meaning-status.mjs', 'netlify/functions/style-print.mjs',
    'netlify/functions/style-print-status.mjs', 'netlify/functions/pack-feedback.mjs', 'netlify/functions/report-problem.mjs', 'netlify/functions/members.mjs',
    'netlify/functions/brain-tester-access.mjs', 'netlify/lib/ad-forwarding.mjs', 'netlify/lib/handoff.mjs', 'netlify/lib/delete-account.mjs', 'netlify/lib/credits.mjs', 'netlify/lib/polar.mjs']],
  ['Names shown under each video (templates and looks)', ['src/creatives-pack.ts', 'src/treatment-deal.ts', 'src/edit-presets.ts']],
];

// Messages only a developer or the staging tester can meet.
const NOISE = [/\}-|-\{/, /^\{[^}]+\}\s+[a-z\-\[\]0-9.\/:]+( [a-z\-\[\]0-9.\/:{}…]+)*$/, /\b(translate[XY]?|scale|blur|rotate)\(/, /^Bearer /, /^\(function/,
  /^[A-Za-z0-9+\/=]{20,}$/, /\?\w+=\{/, /=$/, /^\{\w+\}ms$/, /must be used within/, /^Invalid /, /^(Uncaught|Unhandled|The page crashed)/, /\(\{status\}\)/,
  /^Not signed by/, /^Staging access/, /^Expected /, /^No code or address/, /^Email is unavailable/, /^\w+ is unavailable\.$/, /^(Cloud render|The cloud render worker) /, /^Render request /, /^Audio file is too small/,
  /\bworker\b/, /^(Not available|Unavailable|Feedback unavailable|Say what failed|Say what the phone sends|Only available on staging|Nothing to save)\.$/, /^Tester access/, /^Polar /, /^\{[A-Z_]+\}/,
  /^Mumoo Smart Link Click$/, /^\{(lane|reason)\} · /, / are not configured\.$/, /^The audio clip has the wrong size/, /^The (guess for this clip|print|sound print)/, /^This print expired/,
  /(could not proceed|job failed)\.?/];
// The renderer's own checks: a person never meets them, except a picture that does not load.
const RENDERER_SAYS = /could not be (loaded|read)|Reload the page/;
const DEV_ONLY = /^(Use (POST|GET|PUT|DELETE|PATCH)( or \w+|, \w+)*( or \w+)?\.?|Expected JSON\.?|Invalid request\.?|Request too large\.?|.*only available on staging\.?|Open MUMOO Staging.*|Staging access is invalid or expired\.?|.* is not configured\.?|Accounts are unavailable\.?|Not found\.?|Method not allowed\.?)$/;

const pageTitles = ['index', 'pricing', 'phone', 'welcome', 'legal', 'render'].flatMap(name => {
  const html = existsSync(`${name}.html`) ? readFileSync(`${name}.html`, 'utf8') : '';
  return [...html.matchAll(/<title>([^<]+)<\/title>|<meta name="description" content="([^"]+)"/g)].map(match => ({ file: `${name}.html`, text: match[1] ?? match[2] }));
});

let id = 0;
const key = {};
let total = 0;
const doc = [`# MUMOO: every text people read

Rewrite the text after each number, keep the number (like \`[12]\`) at the start of the line, and send the file back: I put each line back where it came from.

- Keep anything in {curly braces}: the app fills it in (a number, a name, a date). {…} is a part that changes, written as its own line elsewhere when it has words.
- Leave a line as it is to keep it, or write DELETE after the number to remove it.
- The legal documents (Terms, Privacy, Cookies…) are not here: they come from your own files.
- Some sentences are built from pieces (for example "These {need} videos need" followed by a number): rewrite each piece, or write the whole sentence on the first piece and I will rebuild it.
- Names of templates and looks are listed at the end; rewrite them only if you want to. Music style names are not included.

`];
const sections = [];
const titles = pageTitles.filter(({ text }) => !/renderer/.test(text)).map(({ file, text }) => { id++; total++; key[id] = { file, text }; return `[${id}] ${text}`; });
sections.push(`\n## Browser tab titles and the description search engines show\n\n${titles.join('\n')}\n`);
for (const [page, files] of PAGES) {
  const lines = [];
  const inSection = new Map();
  for (const file of files) {
    if (!existsSync(file)) continue;
    const found = extract(file).filter(({ text }) => !DEV_ONLY.test(text) && !NOISE.some(rule => rule.test(text))
      && (!/pack-renderer|pack-scenes/.test(file) || RENDERER_SAYS.test(text)));
    if (!found.length) continue;
    lines.push(`\n### ${file.split('/').pop().replace(/\.\w+$/, '')}\n`);
    const fresh = found.filter(({ line, text }) => {
      const earlier = inSection.get(text);
      if (earlier) { earlier.places.push(`${file}:${line}`); return false; }
      return true;
    });
    if (!fresh.length) { lines.pop(); continue; }
    for (const { line, text } of fresh) { id++; total++; key[id] = { text, places: [`${file}:${line}`] }; inSection.set(text, key[id]); lines.push(`[${id}] ${text}`); }
  }
  if (lines.length) sections.push(`\n## ${page}\n${lines.join('\n')}\n`);
}

doc.push(...sections);
writeFileSync(process.argv[2], doc.join('\n'));
writeFileSync(process.argv[3], JSON.stringify(key, null, 1));
console.log(total, 'lines');
