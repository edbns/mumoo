import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangleIcon, BrainIcon, ImagesIcon, LayoutDashboardIcon, LogOutIcon, Music2Icon, PanelLeftCloseIcon, PanelLeftOpenIcon, type Icon as IconType } from '@/components/icons';
import '@fontsource-variable/inter';
import { authClient, checkSignInCode, sendSignInCode } from '../account';
import { Button } from '@/components/ui/button';
import { SignInDialog } from '../sign-in-dialog';
import { AdminError, loadOverview, type Overview } from './api';
import { GenreView } from './genre';
import { LearningView } from './learning';
import { LibraryView, type StatusFilter } from './library';
import { OverviewView } from './overview';
import { ProblemsView } from './problems';
import './admin.css';

type Section = 'overview' | 'library' | 'learning' | 'genre' | 'errors';
const SECTIONS: { id: Section; label: string; icon: IconType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboardIcon },
  { id: 'library', label: 'Library', icon: ImagesIcon },
  { id: 'learning', label: 'Learning', icon: BrainIcon },
  { id: 'genre', label: 'Genre training', icon: Music2Icon },
  { id: 'errors', label: 'Errors', icon: AlertTriangleIcon },
];
/** `#library/pending` opens the library on one status (the overview's numbers link there). */
const sectionFromHash = (): Section => SECTIONS.find(section => window.location.hash.split('/')[0] === `#${section.id}`)?.id ?? 'overview';
const filterFromHash = (): StatusFilter | undefined => {
  const value = window.location.hash.split('/')[1];
  return value === 'pending' || value === 'approved' || value === 'hidden' || value === 'all' ? value : undefined;
};
const MENU_KEY = 'mumoo-admin-menu';

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[var(--radius-panel)] bg-card p-8 text-center shadow-sm">{children}</div></main>;
}

function Admin() {
  const session = authClient.useSession();
  const signedIn = session.data?.user;
  /**
   * The client re-checks the session whenever the window is focused (for instance on coming back from the email with the code),
   * and for a moment that check can report nobody. The page must not react to that: swapping the sign-in popup for a spinner
   * would throw away the email being typed. So the last person stays until the check says otherwise, and the spinner is for the first load only.
   */
  const [last, setLast] = useState(signedIn);
  // Remembered only from a settled check: once a check ends with nobody (signed out), nobody is remembered.
  useEffect(() => { if (!session.isPending) setLast(signedIn); }, [session.isPending, signedIn]);
  const user = signedIn ?? (session.isPending ? last : undefined);
  const [known, setKnown] = useState(false);
  useEffect(() => { if (!session.isPending) setKnown(true); }, [session.isPending]);
  const [signingIn, setSigningIn] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [filter, setFilter] = useState(filterFromHash);
  /** The menu opens and closes; closed it is a row of icons. Remembered on this computer; on a small screen it starts closed. */
  const [menuOpen, setMenuOpen] = useState(() => localStorage.getItem(MENU_KEY) ? localStorage.getItem(MENU_KEY) === 'open' : window.innerWidth >= 1024);
  useEffect(() => { localStorage.setItem(MENU_KEY, menuOpen ? 'open' : 'closed'); }, [menuOpen]);
  const closeSignIn = useCallback(() => setSigningIn(false), []);
  /** The address the sign-in code was sent to, which the code is checked against. */
  const address = useRef('');

  useEffect(() => {
    const onHash = () => { setSection(sectionFromHash()); setFilter(filterFromHash()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Whether this person may be here is the server's answer, never the page's.
  const refresh = useCallback(() => loadOverview().then(setOverview, () => undefined), []);
  // The numbers are fresh each time the overview is opened (a sale or an upload since).
  useEffect(() => { if (section === 'overview' && overview) void refresh(); }, [section]);
  useEffect(() => {
    setOverview(null);
    setDenied(null);
    if (!user) return;
    loadOverview().then(setOverview, (cause: Error) => setDenied(cause instanceof AdminError && cause.status === 403 ? 'This account does not have access.'
      : `${cause.message}${cause instanceof AdminError ? ` (error ${cause.status})` : ''}`));
  }, [user?.id]);

  const signOut = <Button variant="secondary" onClick={() => void authClient.signOut()}><LogOutIcon className="size-4" aria-hidden="true" />Sign out</Button>;

  if (!known && !user) return <Centered><span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-label="Loading" /></Centered>;
  if (!user) return <>
    <Centered>
      <img src="/brand/mumoo-logo.png" alt="mumoo" className="h-5 w-auto" />
      <p className="m-0 text-sm text-muted-foreground">Admin. Sign in with your admin email.</p>
      <Button onClick={() => setSigningIn(true)}>Sign in</Button>
    </Centered>
    <SignInDialog open={signingIn} onClose={closeSignIn} hideTerms
      onSendCode={async email => { await sendSignInCode(email); address.current = email; }}
      onCheckCode={async code => { await checkSignInCode(address.current, code); return true; }} />
  </>;
  if (denied) return <Centered>
    <p role="alert" className="m-0 text-sm">{denied}</p>
    <p className="m-0 text-xs text-muted-foreground">Signed in as {user.email}</p>
    {signOut}
  </Centered>;
  if (!overview) return <Centered><span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-label="Loading" /></Centered>;

  return <div className="flex min-h-screen">
    <aside className={`sticky top-0 flex h-screen shrink-0 flex-col gap-6 bg-card p-3 transition-[width] duration-200 ease-out ${menuOpen ? 'w-56' : 'w-16'}`}>
      <div className={`flex items-center ${menuOpen ? 'justify-between pl-1' : 'justify-center'}`}>
        {menuOpen && <img src="/brand/mumoo-logo.png" alt="mumoo" className="h-4 w-auto" />}
        <Button variant="ghost" size="sm" className="size-9 p-0" onClick={() => setMenuOpen(open => !open)}
          aria-label={menuOpen ? 'Close the menu' : 'Open the menu'} aria-expanded={menuOpen} title={menuOpen ? 'Close the menu' : 'Open the menu'}>
          {menuOpen ? <PanelLeftCloseIcon className="size-4" aria-hidden="true" /> : <PanelLeftOpenIcon className="size-4" aria-hidden="true" />}
        </Button>
      </div>
      <nav aria-label="Admin" className="flex flex-col gap-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined} title={menuOpen ? undefined : label}
          className={`relative flex items-center gap-2.5 rounded-[var(--radius-control)] py-2 text-sm no-underline transition-colors ${menuOpen ? 'px-3' : 'justify-center px-0'} ${section === id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {menuOpen ? label : <span className="sr-only">{label}</span>}
          {id === 'errors' && overview.problems.unseen > 0 && <span className={`rounded-full bg-destructive px-1.5 text-xs font-medium text-white ${menuOpen ? 'ml-auto' : 'absolute -right-1 -top-1'}`}>{overview.problems.unseen}</span>}
        </a>)}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        {menuOpen && <p className="m-0 truncate text-xs text-muted-foreground" title={overview.email}>{overview.email}</p>}
        {menuOpen ? signOut : <Button variant="secondary" className="size-9 self-center p-0" onClick={() => void authClient.signOut()} aria-label="Sign out" title="Sign out"><LogOutIcon className="size-4" aria-hidden="true" /></Button>}
      </div>
    </aside>
    <main className="min-w-0 flex-1 p-6 lg:p-8">
      {section === 'overview' && <OverviewView overview={overview} />}
      {section === 'library' && <LibraryView key={filter ?? ''} initialStatus={filter} onChanged={refresh} />}
      {section === 'learning' && <LearningView />}
      {section === 'genre' && <GenreView />}
      {section === 'errors' && <ProblemsView onChanged={refresh} />}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Admin />);
