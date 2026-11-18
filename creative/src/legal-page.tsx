import { Fragment, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseMarkdown, type Block, type Inline } from './legal-markdown';
import { CookieBanner } from './legal-corner';
import { openCookieSettings } from './consent';
import '@fontsource-variable/inter';
import './styles/index.css';

const SOURCES = import.meta.glob<string>('../legal/*.md', { query: '?raw', import: 'default', eager: true });

const LEGAL_DOCUMENTS = ['terms', 'privacy', 'cookies', 'acceptable-use', 'refunds', 'ai', 'dpa'].map(slug => {
  const blocks = parseMarkdown(SOURCES[`../legal/${slug}.md`]);
  const heading = blocks.find(block => block.kind === 'heading');
  const title = heading?.kind === 'heading' ? heading.children.map(plain).join('') : slug;
  return { slug, title, label: slug === 'dpa' ? 'Ad Forwarding DPA' : title, blocks };
});

function plain(node: Inline): string {
  if (node.kind === 'text' || node.kind === 'code') return node.text;
  return node.kind === 'break' ? ' ' : node.children.map(plain).join('');
}

function inlines(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text': return <Fragment key={index}>{node.text}</Fragment>;
      case 'break': return <br key={index} />;
      case 'code': return <code key={index} className="font-mono text-[0.9em]">{node.text}</code>;
      case 'strong': return <strong key={index} className="font-semibold text-foreground">{inlines(node.children)}</strong>;
      case 'em': return <em key={index}>{inlines(node.children)}</em>;
      case 'link': return <a key={index} href={node.href} className="text-foreground underline underline-offset-4 hover:text-primary">{inlines(node.children)}</a>;
    }
  });
}

function block(node: Block, index: number): ReactNode {
  switch (node.kind) {
    case 'heading':
      if (node.level === 1) return <h1 key={index} className="mb-6 text-3xl font-semibold tracking-tight text-foreground">{inlines(node.children)}</h1>;
      if (node.level === 2) return <h2 key={index} className="mt-10 mb-3 text-lg font-semibold text-foreground">{inlines(node.children)}</h2>;
      return <h3 key={index} className="mt-6 mb-2 font-semibold text-foreground">{inlines(node.children)}</h3>;
    case 'paragraph': return <p key={index} className="my-3">{inlines(node.children)}</p>;
    case 'rule': return <hr key={index} className="my-8 border-border" />;
    case 'list': {
      const List = node.ordered ? 'ol' : 'ul';
      return <List key={index} className={`my-3 flex flex-col gap-1.5 pl-5 ${node.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted-foreground`}>
        {node.items.map((item, at) => <li key={at}>{inlines(item)}</li>)}
      </List>;
    }
  }
}

const slugAt = (path: string) => path.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
const titleOf = (slug: string) => `${LEGAL_DOCUMENTS.find(doc => doc.slug === slug)?.title ?? 'Legal'} · MUMOO`;

function LegalPage() {
  const [slug, setSlug] = useState(() => slugAt(location.pathname));
  const document = LEGAL_DOCUMENTS.find(doc => doc.slug === slug);

  useEffect(() => { window.document.title = titleOf(slug); }, [slug]);
  useEffect(() => {
    const back = () => setSlug(slugAt(location.pathname));
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  // Moving between documents stays on this page: no reload, so nothing flashes.
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest('a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    const url = new URL(link.href);
    const next = slugAt(url.pathname);
    if (url.origin !== location.origin || (next !== 'legal' && !LEGAL_DOCUMENTS.some(doc => doc.slug === next))) return;
    event.preventDefault();
    if (next !== slug) history.pushState(null, '', url.pathname);
    setSlug(next);
    window.scrollTo({ top: 0 });
  };

  return <div className="flex flex-1 flex-col text-foreground" onClick={follow}>
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <a href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to MUMOO</a>
    </header>
    <div className="mx-auto grid max-w-5xl gap-10 px-6 pb-24 pt-6 md:grid-cols-[180px_1fr]">
      <nav aria-label="Legal documents" className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:sticky md:top-6 md:flex-col md:self-start">
        {LEGAL_DOCUMENTS.map(doc => <a key={doc.slug} href={`/${doc.slug}`} aria-current={doc.slug === slug ? 'page' : undefined}
          className={doc.slug === slug ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}>{doc.label}</a>)}
        <button type="button" onClick={openCookieSettings} className="cursor-pointer rounded-none bg-transparent p-0 text-left text-muted-foreground hover:text-foreground">Cookie settings</button>
      </nav>
      <article className="max-w-2xl break-keep text-[15px] leading-relaxed text-muted-foreground">
        {document ? document.blocks.map(block) : <>
          <h1 className="mb-6 text-3xl font-semibold tracking-tight text-foreground">Legal</h1>
          <p className="my-3">The terms and policies for using MUMOO. Questions go to <a href="mailto:moo@mumoo.app" className="text-foreground underline underline-offset-4">moo@mumoo.app</a>.</p>
          <ul className="mt-6 flex flex-col divide-y divide-border border-y border-border">
            {LEGAL_DOCUMENTS.map(doc => <li key={doc.slug}><a href={`/${doc.slug}`} className="block py-3 text-foreground hover:text-primary">{doc.title}</a></li>)}
          </ul>
        </>}
      </article>
    </div>
    <CookieBanner />
  </div>;
}

createRoot(document.getElementById('root')!).render(<LegalPage />);
