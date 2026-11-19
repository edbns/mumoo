import { SendIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { accountFetch } from './account';

/** Must match MAX_MESSAGE_CHARS in `netlify/lib/support.mjs`. */
const MAX_CHARS = 500;
const THINKING_POLL_MS = 2500;
/** While open, the team's replies show up without a reload. */
const IDLE_POLL_MS = 20_000;

type Message = { id: number; author: 'person' | 'helper' | 'team'; text: string; at: string };
type Conversation = { status: 'helper' | 'waiting' | 'answered'; thinking: boolean; messages: Message[] };

const talk = async (init?: RequestInit) => (await accountFetch('/api/support', init)).json() as Promise<Conversation>;
const post = (body: object) => talk({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const WHO = { helper: 'MUMOO helper', team: 'MUMOO team', person: 'You' } as const;

/**
 * The help chat (signed in only). The helper answers with MUMOO's own written replies; it can pass the chat to the team, who
 * answer here and by email. Loaded only when the person opens Help.
 */
export default function SupportChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chat, setChat] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);

  const apply = (next: Promise<Conversation>) => next.then(fresh => { setChat(fresh); setError(''); }, (cause: Error) => setError(cause.message));

  useEffect(() => { if (open) void apply(talk()); }, [open]);
  useEffect(() => {
    if (!open || !chat) return;
    const timer = window.setTimeout(() => void apply(talk()), chat.thinking ? THINKING_POLL_MS : IDLE_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [open, chat]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat?.messages.length, chat?.thinking]);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await apply(post({ message }).then(fresh => { setDraft(''); return fresh; }));
    } finally {
      setSending(false);
    }
  };
  const askTeam = () => { setSending(true); void apply(post({ team: true })).finally(() => setSending(false)); };

  const withTeam = chat && chat.status !== 'helper';
  return <Modal open={open} onClose={onClose} title="Help" description="Ask about credits, your videos, uploads or smart links." maxWidth={460}>
    <div className="flex flex-col gap-3">
      <div ref={list} className="flex max-h-[min(50vh,420px)] min-h-40 flex-col gap-2 overflow-y-auto" aria-live="polite">
        <Bubble author="helper" text="Hey! I’m MUMOO’s helper. Ask me anything about MUMOO, and I can pass you to the team anytime." />
        {chat?.messages.map(message => <Bubble key={message.id} author={message.author} text={message.text} />)}
        {chat?.thinking && <p className="m-0 flex items-center gap-1.5 self-start rounded-2xl bg-background px-3 py-2 text-sm text-muted-foreground">
          <span className="support-typing" aria-hidden="true"><i /><i /><i /></span>Thinking…
        </p>}
        {!chat && !error && <p className="m-0 text-center text-xs text-muted-foreground">Loading…</p>}
      </div>
      {withTeam && <p className="m-0 text-center text-xs text-muted-foreground">The team has this chat. We’ll reply here or by email.</p>}
      {error && <p role="alert" className="m-0 text-center text-sm text-destructive">{error}</p>}
      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor="support-message">Your message</label>
        <textarea id="support-message" rows={2} maxLength={MAX_CHARS} value={draft} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
          placeholder="Type your question…"
          className="min-h-11 flex-1 resize-none rounded-[var(--radius-control)] bg-background px-3 py-2 text-sm text-foreground outline-ring placeholder:text-muted-foreground focus-visible:outline-2" />
        <Button type="submit" className="size-11 px-0" disabled={sending || !draft.trim()} aria-label="Send"><SendIcon aria-hidden="true" className="size-4" /></Button>
      </form>
      {!withTeam && <Button variant="secondary" disabled={sending || !chat} onClick={askTeam}>Talk to a person</Button>}
    </div>
  </Modal>;
}

function Bubble({ author, text }: { author: Message['author']; text: string }) {
  const mine = author === 'person';
  return <div className={`flex max-w-[85%] flex-col gap-0.5 ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
    {author === 'team' && <span className="px-1 text-xs font-medium text-primary">{WHO.team}</span>}
    <p className={`m-0 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
      <span className="sr-only">{WHO[author]}: </span>{text}
    </p>
  </div>;
}
