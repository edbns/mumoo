import { useEffect, useState } from 'react';
import { CheckIcon, FlagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { closeHelp, loadHelp, loadHelpThread, replyHelp, type HelpConversation, type HelpStatus, type HelpThread } from './api';

const STATUS: Record<HelpStatus, string> = { waiting: 'Waiting for you', answered: 'Answered', helper: 'Helper' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const AUTHOR = { person: 'Them', helper: 'Helper', team: 'You' } as const;

/**
 * The help chat inbox: waiting conversations first. A reply shows in the person's chat and is emailed to them; Done hands the
 * person back to the helper. Flagged means they tried to make the helper break its rules.
 */
export function HelpView({ onChanged }: { onChanged: () => void }) {
  const [threads, setThreads] = useState<HelpThread[] | null>(null);
  const [open, setOpen] = useState<HelpConversation | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshList = () => loadHelp().then(list => { setThreads(list.threads); onChanged(); }, (cause: Error) => setError(cause.message));
  useEffect(() => { void refreshList(); }, []);

  const act = async (action: Promise<HelpConversation>) => {
    setBusy(true);
    try {
      setOpen(await action);
      setError('');
      await refreshList();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <h1 className="m-0 text-2xl font-semibold">Help chat</h1>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {!threads ? <p className="m-0 text-sm text-muted-foreground">Loading…</p>
        : threads.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-8 text-center text-sm text-muted-foreground">No chats yet.</p>
        : <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {threads.map(thread => <li key={thread.userId}>
            <button type="button" onClick={() => { setDraft(''); void act(loadHelpThread(thread.userId)); }}
              className={`flex w-full cursor-pointer flex-col gap-1 rounded-[var(--radius-panel)] bg-card p-4 text-left shadow-sm ${open?.userId === thread.userId ? 'outline-2 outline-primary' : ''}`}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="min-w-0 flex-1 truncate">{thread.email}</span>
                {thread.flagged && <FlagIcon aria-label={`Flagged (${thread.flags})`} className="size-4 text-destructive" />}
                <span className={`rounded-full px-2 py-0.5 text-xs ${thread.status === 'waiting' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{STATUS[thread.status]}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{thread.last}</span>
              <span className="text-xs text-muted-foreground">{when(thread.updatedAt)}</span>
            </button>
          </li>)}
        </ul>}
      {open && <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-4 shadow-sm" aria-label={`Chat with ${open.email}`}>
        <header className="flex items-center justify-between gap-3">
          <p className="m-0 truncate text-sm font-medium">{open.email}</p>
          <Button size="sm" variant="secondary" disabled={busy || open.status === 'helper'} onClick={() => void act(closeHelp(open.userId))}>
            <CheckIcon aria-hidden="true" className="size-4" />Done, back to the helper
          </Button>
        </header>
        <ol className="m-0 flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
          {open.messages.map(message => <li key={message.id} className={`rounded-[var(--radius)] p-3 text-sm ${message.author === 'person' ? 'bg-muted' : 'bg-background'} ${message.flagged ? 'outline-1 outline-destructive' : ''}`}>
            <span className="block text-xs text-muted-foreground">{AUTHOR[message.author]} · {when(message.at)}{message.flagged ? ' · tried to break the rules' : ''}</span>
            <span className="whitespace-pre-wrap break-words">{message.text}</span>
          </li>)}
        </ol>
        <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); if (draft.trim()) void act(replyHelp(open.userId, draft.trim()).then(next => { setDraft(''); return next; })); }}>
          <label className="text-xs text-muted-foreground" htmlFor="help-reply">Reply (shown in their chat and emailed to them)</label>
          <textarea id="help-reply" rows={4} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)}
            className="resize-y rounded-[var(--radius-control)] bg-background p-3 text-sm outline-ring focus-visible:outline-2" />
          <Button type="submit" className="self-end" disabled={busy || !draft.trim()}>Send reply</Button>
        </form>
      </section>}
    </div>
  </div>;
}
