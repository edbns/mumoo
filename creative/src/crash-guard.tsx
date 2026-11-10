import { Component, type ReactNode } from 'react';
import { reportProblem } from './report-problem';

/**
 * Without this, one error while a page draws leaves a black screen with nothing to read. It shows what happened, lets the person
 * start again (the cart is kept), and tells our server, so the admin's problem list names the error.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportProblem('render', `The page crashed: ${error.message}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <main role="alert" style={{ padding: '4rem 1.5rem', maxWidth: 560, margin: '0 auto', color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Something went wrong on this page</h1>
      <p>Your cart is kept. Reload to start again.</p>
      <p style={{ opacity: 0.6, fontSize: '0.85rem', wordBreak: 'break-word' }}>{error.message}</p>
      <button type="button" onClick={() => location.reload()} style={{ padding: '0.75rem 1.25rem', borderRadius: 999, border: 0, background: '#2bff2b', color: '#000', fontWeight: 600 }}>Reload</button>
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
  window.addEventListener('unhandledrejection', event => note(`Unhandled: ${(event.reason as Error)?.message ?? String(event.reason)}`));
}
