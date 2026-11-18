// Just enough Markdown for the legal documents. Everything becomes React elements, never HTML, so a document can't inject anything.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'break' };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'rule' };

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s)]+[^\s).,;:])/g;

function safeHref(href: string): string | null {
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return /^(https?:|mailto:)/i.test(href) ? href : null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) out.push({ kind: 'text', text: text.slice(at, match.index) });
    const [whole, strong, em, code, label, href, email, url] = match;
    if (strong !== undefined) out.push({ kind: 'strong', children: parseInline(strong) });
    else if (em !== undefined) out.push({ kind: 'em', children: parseInline(em) });
    else if (code !== undefined) out.push({ kind: 'code', text: code });
    else if (label !== undefined) {
      const safe = safeHref(href);
      out.push(safe ? { kind: 'link', href: safe, children: parseInline(label) } : { kind: 'text', text: whole });
    } else if (email !== undefined) out.push({ kind: 'link', href: `mailto:${email}`, children: [{ kind: 'text', text: email }] });
    else out.push({ kind: 'link', href: url, children: [{ kind: 'text', text: url }] });
    at = match.index + whole.length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[] | null = null;
  let list: Extract<Block, { kind: 'list' }> | null = null;
  let hardBreak = false;
  const close = () => { paragraph = null; list = null; };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (!line.trim()) close();
    else if (/^\s*(?:-{3,}|\*{3,})$/.test(line)) { close(); blocks.push({ kind: 'rule' }); }
    else if (heading) { close(); blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) }); }
    else if (item) {
      const ordered = item[2] !== undefined;
      paragraph = null;
      if (!list || list.ordered !== ordered) { list = { kind: 'list', ordered, items: [] }; blocks.push(list); }
      list.items.push(parseInline(item[3]));
    } else if (list && /^\s+/.test(raw)) {
      list.items[list.items.length - 1].push({ kind: 'text', text: ' ' }, ...parseInline(line.trim()));
    } else {
      list = null;
      const children = parseInline(line.trim().replace(/\\$/, ''));
      if (paragraph) paragraph.push(hardBreak ? { kind: 'break' } : { kind: 'text', text: ' ' }, ...children);
      else { paragraph = children; blocks.push({ kind: 'paragraph', children: paragraph }); }
    }
    hardBreak = raw.endsWith('  ') || line.endsWith('\\');
  }
  return blocks;
}
