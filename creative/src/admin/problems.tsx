import { useEffect, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadProblems, markAllSeen, markProblemSeen, type Problem } from './api';

const KIND: Record<Problem['kind'], string> = { render: 'Render', download: 'Download', sign_in: 'Sign-in' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Failed renders, downloads and sign-ins, with the time and the person. Unseen ones come first. */
export function ProblemsView({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<{ problems: Problem[]; unseen: number } | null>(null);
  const [error, setError] = useState('');

  const apply = (action: Promise<{ problems: Problem[]; unseen: number }>) => action.then(next => { setState(next); setError(''); onChanged(); }, (cause: Error) => setError(cause.message));
  useEffect(() => { void apply(loadProblems()); }, []);

  return <div className="mx-auto flex max-w-4xl flex-col gap-6">
    <header className="flex items-center justify-between gap-4">
      <h1 className="m-0 text-2xl font-semibold">Errors</h1>
      <Button variant="secondary" disabled={!state?.unseen} onClick={() => void apply(markAllSeen())}><CheckIcon className="size-4" aria-hidden="true" />Mark all as seen</Button>
    </header>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!state ? <p className="m-0 text-sm text-muted-foreground">Loading…</p>
      : state.problems.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-8 text-center text-sm text-muted-foreground">No errors. Failed renders, downloads and sign-ins will show up here.</p>
      : <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.problems.map(problem => <li key={problem.id} className={`flex items-start gap-4 rounded-[var(--radius-panel)] bg-card p-4 shadow-sm ${problem.seen ? 'opacity-60' : ''}`}>
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${problem.seen ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive'}`}>{KIND[problem.kind]}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="m-0 break-words text-sm">{problem.message}</p>
            <p className="m-0 text-xs text-muted-foreground">
              {when(problem.createdAt)} · {problem.userId ? problem.email : problem.email ? `${problem.email} (typed, not signed in)` : 'Not signed in'}
            </p>
          </div>
          {!problem.seen && <Button size="sm" variant="ghost" onClick={() => void apply(markProblemSeen(problem.id))}>Mark as seen</Button>}
        </li>)}
      </ul>}
  </div>;
}
