import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isStaleChunk } from './friendly-error';
import { reportProblem } from './report-problem';

const RELOADED_AT = 'mumoo-reloaded-after-update';
/** A tab reloaded for an update this recently that still fails is not reloaded again: it shows the page below instead of looping. */
const RELOAD_AGAIN_MS = 30_000;

/** After a deploy, an open tab asks for files that are gone: the page reloads once by itself, onto the new version. */
function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < RELOAD_AGAIN_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/**
 * Without this, one error while a page draws leaves a black screen with nothing to read. It says something went wrong (never the
 * error itself), lets the person start again (the cart is kept), and tells our server, so the admin's problem list names the error.
 * A page that broke only because MUMOO was updated meanwhile reloads by itself.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null; reloading: boolean }> {
  state = { error: null as Error | null, reloading: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isStaleChunk(error) && reloadForUpdate()) {
      this.setState({ reloading: true });
      return;
    }
    reportProblem('render', `The page crashed: ${error.message}`);
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) return null;
    return <main role="alert" className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-[var(--radius-panel)] bg-background px-8 py-10 text-center">
        <img src="/brand/favicon.png" alt="" width={56} height={56} className="rounded-[22.5%] shadow-[0_8px_24px_rgba(47,233,43,0.18)]" />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-balance text-2xl font-semibold tracking-tight text-foreground">Something went wrong on this page</h1>
          <p className="m-0 text-sm text-muted-foreground">Your chosen videos are still here. Reload to keep going.</p>
        </div>
        <Button onClick={() => location.reload()}>Reload</Button>
      </div>
    </main>;
  }
}

/** Errors that no page caught (a render that failed in the background) also reach the admin's problem list, once per kind of message. */
export function reportUncaughtErrors() {
  const seen = new Set<string>();
  const note = (message: string) => {
    if (seen.has(message) || seen.size > 5) return;
    seen.add(message);
    reportProblem('render', message);
  };
  window.addEventListener('error', event => note(`Uncaught: ${event.message}`));
  window.addEventListener('unhandledrejection', event => {
    if (isStaleChunk(event.reason) && reloadForUpdate()) return;
    note(`Unhandled: ${(event.reason as Error)?.message ?? String(event.reason)}`);
  });
}
