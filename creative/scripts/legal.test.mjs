import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { parseInline, parseMarkdown } = await server.ssrLoadModule('/src/legal-markdown.ts');
await server.close();

const SLUGS = ['terms-of-service', 'privacy-policy', 'cookie-policy', 'acceptable-use-policy', 'refund-policy', 'ai-disclosure', 'data-processing-agreement'];

test('every legal document has its own address, in netlify.toml and the dev server', () => {
  const files = readdirSync(new URL('../legal/', import.meta.url)).filter(name => name.endsWith('.md')).map(name => name.replace(/\.md$/, '')).sort();
  assert.deepEqual(files, [...SLUGS].sort());
  const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const dev = readFileSync(new URL('../dev/local-preview-api.mjs', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/legal-page.tsx', import.meta.url), 'utf8');
  for (const slug of [...SLUGS, 'legal']) {
    assert.match(toml, new RegExp(`from = "/${slug}"\\n  to = "/legal.html"`), slug);
    assert.match(dev, new RegExp(`[|(]${slug}[|)]`), slug);
  }
  const paths = readFileSync(new URL('../src/site-paths.ts', import.meta.url), 'utf8');
  for (const slug of SLUGS) assert.match(paths, new RegExp(`'/${slug}'`), slug);
  assert.match(page, /Object\.values\(LEGAL_PATHS\)/);
});

test('the published documents start with their title and carry no draft notes', () => {
  for (const slug of SLUGS) {
    const source = readFileSync(new URL(`../legal/${slug}.md`, import.meta.url), 'utf8');
    const blocks = parseMarkdown(source);
    assert.equal(blocks[0].kind, 'heading', slug);
    assert.equal(blocks[0].level, 1, slug);
    assert.doesNotMatch(source, /not legal advice|draft for review/i, slug);
  }
});

test('markdown: headings, hard breaks, lists and rules', () => {
  const blocks = parseMarkdown('# Title\n\n**Updated:** today  \n**Contact:** moo@mumoo.app\n\n- one\n- two\n  continued\n\n1. first\n\n---\n\nplain\ntext');
  assert.deepEqual(blocks.map(block => block.kind), ['heading', 'paragraph', 'list', 'list', 'rule', 'paragraph']);
  assert.ok(blocks[1].children.some(node => node.kind === 'break'));
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(blocks[5].children.map(node => node.text), ['plain', ' ', 'text']);
});

test('markdown links only go to safe places, and emails become mail links', () => {
  assert.ok(!parseInline('[x](javascript:alert(1))').some(node => node.kind === 'link'));
  assert.ok(!parseInline('[x](//evil.example)').some(node => node.kind === 'link'));
  assert.deepEqual(parseInline('[Privacy](/privacy)'), [{ kind: 'link', href: '/privacy', children: [{ kind: 'text', text: 'Privacy' }] }]);
  assert.deepEqual(parseInline('write to moo@mumoo.app.')[1], { kind: 'link', href: 'mailto:moo@mumoo.app', children: [{ kind: 'text', text: 'moo@mumoo.app' }] });
  assert.equal(parseInline('**bold** and *it*')[0].kind, 'strong');
});
