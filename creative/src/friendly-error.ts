/** After a new deploy, an already-open tab asks for chunk files that no longer exist. */
export function friendlyError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)) {
    return 'MUMOO was just updated. Reload this page to continue.';
  }
  return message || fallback;
}
