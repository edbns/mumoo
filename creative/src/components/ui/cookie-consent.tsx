// Cookie Consent from Hirael <https://hirael.com/blocks/widgets/cookie-consent>
// MIT · Mohammad Shehadeh · https://github.com/MohammadShehadeh/hirael

import * as React from 'react';
import { Cookie } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CookiePreferences } from '@/consent';

interface CategoryRecord {
  id: string;
  required: boolean;
}

interface CookieConsentContextValue {
  prefs: CookiePreferences;
  setPref: (id: string, checked: boolean) => void;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  register: (category: CategoryRecord) => () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  save: () => void;
}

const CookieConsentContext = React.createContext<CookieConsentContextValue | null>(null);

const useCookieConsent = () => {
  const ctx = React.useContext(CookieConsentContext);
  if (!ctx) throw new Error('CookieConsent parts must be used within <CookieConsent>');
  return ctx;
};

const writeStored = (key: string, prefs: CookiePreferences) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode, quota); the choice still reaches `onChange`.
  }
};

interface CookieConsentProps extends Omit<React.ComponentProps<'div'>, 'onChange'> {
  /** localStorage key the choice is saved under. */
  storageKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting values before the visitor decides. Required categories are always on. */
  defaultPreferences?: CookiePreferences;
  /** Called with the final preferences on Accept all, Reject all, or Save. */
  onChange?: (prefs: CookiePreferences) => void;
}

const CookieConsent = ({ storageKey, open, onOpenChange, defaultPreferences, onChange, className, children, ...props }: CookieConsentProps) => {
  const [prefs, setPrefs] = React.useState<CookiePreferences>(() => defaultPreferences ?? {});
  const [expanded, setExpanded] = React.useState(false);
  const categoriesRef = React.useRef<Map<string, CategoryRecord>>(new Map());

  const register = React.useCallback((category: CategoryRecord) => {
    categoriesRef.current.set(category.id, category);
    return () => { categoriesRef.current.delete(category.id); };
  }, []);

  const setPref = React.useCallback((id: string, checked: boolean) => {
    setPrefs(prev => ({ ...prev, [id]: checked }));
  }, []);

  const commit = React.useCallback((next: CookiePreferences) => {
    writeStored(storageKey, next);
    setPrefs(next);
    onChange?.(next);
    setExpanded(false);
    onOpenChange(false);
  }, [storageKey, onChange, onOpenChange]);

  const acceptAll = React.useCallback(() => {
    const next: CookiePreferences = {};
    for (const { id } of categoriesRef.current.values()) next[id] = true;
    commit(next);
  }, [commit]);

  const rejectAll = React.useCallback(() => {
    const next: CookiePreferences = {};
    for (const { id, required } of categoriesRef.current.values()) next[id] = required;
    commit(next);
  }, [commit]);

  const save = React.useCallback(() => {
    const next: CookiePreferences = {};
    for (const { id, required } of categoriesRef.current.values()) next[id] = required || Boolean(prefs[id]);
    commit(next);
  }, [commit, prefs]);

  const value = React.useMemo<CookieConsentContextValue>(
    () => ({ prefs, setPref, expanded, setExpanded, register, acceptAll, rejectAll, save }),
    [prefs, setPref, expanded, register, acceptAll, rejectAll, save],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && expanded) {
      event.stopPropagation();
      setExpanded(false);
    }
  };

  if (!open) return null;

  return (
    <CookieConsentContext.Provider value={value}>
      <div
        role="dialog"
        aria-modal={false}
        aria-label="Cookie preferences"
        data-slot="cookie-consent"
        data-expanded={expanded ? '' : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          'fixed bottom-4 end-4 z-50 flex w-[calc(100%-2rem)] max-w-xs flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg',
          'animate-in fade-in-0 slide-in-from-bottom-4 duration-300 motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CookieConsentContext.Provider>
  );
};

const CookieConsentTitle = ({ className, children, ...props }: React.ComponentProps<'h2'>) => (
  <h2 data-slot="cookie-consent-title" className={cn('flex items-center gap-2 text-sm font-semibold text-foreground', className)} {...props}>
    <Cookie aria-hidden className="size-4 text-muted-foreground" />
    {children}
  </h2>
);

const CookieConsentDescription = ({ className, ...props }: React.ComponentProps<'p'>) => (
  <p data-slot="cookie-consent-description" className={cn('text-xs leading-relaxed text-muted-foreground', className)} {...props} />
);

/** Expands the per-category switches. Hidden once they're showing. */
const CookieConsentManage = ({ className, children = 'Manage', ...props }: React.ComponentProps<typeof Button>) => {
  const { expanded, setExpanded } = useCookieConsent();
  if (expanded) return null;
  return (
    <Button variant="ghost" size="sm" data-slot="cookie-consent-manage" aria-expanded={expanded} onClick={() => setExpanded(true)}
      className={cn('px-2', className)} {...props}>
      {children}
    </Button>
  );
};

/** Shows its categories only while the banner is expanded; they stay mounted so Accept all and Reject all know every category. */
const CookieConsentCategories = ({ className, ...props }: React.ComponentProps<'div'>) => {
  const { expanded } = useCookieConsent();
  return <div data-slot="cookie-consent-categories" hidden={!expanded} className={cn('flex flex-col divide-y divide-border rounded-md border border-border bg-background', className)} {...props} />;
};

interface CookieConsentCategoryProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** Key the choice is stored under, e.g. "analytics". */
  id: string;
  name: React.ReactNode;
  description?: React.ReactNode;
  /** Always on and cannot be switched off. */
  required?: boolean;
}

const CookieConsentCategory = ({ id, name, description, required = false, className, ...props }: CookieConsentCategoryProps) => {
  const { prefs, setPref, register } = useCookieConsent();
  React.useEffect(() => register({ id, required }), [register, id, required]);
  const checked = required || Boolean(prefs[id]);
  const switchId = `cookie-consent-${id}`;
  return (
    <div data-slot="cookie-consent-category" data-required={required ? '' : undefined} className={cn('flex items-start justify-between gap-4 p-3', className)} {...props}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={switchId} className="flex items-center gap-2 text-sm font-medium">
          {name}
          {required && <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Always on</span>}
        </label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <SwitchPrimitive.Root id={switchId} checked={checked} disabled={required} onCheckedChange={next => setPref(id, next)}
        className="mt-0.5 inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full bg-secondary p-0.5 transition-colors outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary">
        <SwitchPrimitive.Thumb className="block size-3 rounded-full bg-foreground transition-transform data-[state=checked]:translate-x-3 data-[state=checked]:bg-primary-foreground" />
      </SwitchPrimitive.Root>
    </div>
  );
};

const CookieConsentActions = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div data-slot="cookie-consent-actions" className={cn('flex flex-wrap items-center gap-2', className)} {...props} />
);

type CookieConsentButtonProps = React.ComponentProps<typeof Button>;

const CookieConsentAcceptAll = ({ children = 'Accept all', ...props }: CookieConsentButtonProps) => {
  const { acceptAll } = useCookieConsent();
  return <Button size="sm" data-slot="cookie-consent-accept-all" onClick={acceptAll} {...props}>{children}</Button>;
};

const CookieConsentRejectAll = ({ children = 'Reject all', ...props }: CookieConsentButtonProps) => {
  const { rejectAll } = useCookieConsent();
  return <Button variant="secondary" size="sm" data-slot="cookie-consent-reject-all" onClick={rejectAll} {...props}>{children}</Button>;
};

/** Saves the current switches. Only shown while categories are expanded. */
const CookieConsentSave = ({ children = 'Save choices', ...props }: CookieConsentButtonProps) => {
  const { expanded, save } = useCookieConsent();
  if (!expanded) return null;
  return <Button variant="secondary" size="sm" data-slot="cookie-consent-save" onClick={save} {...props}>{children}</Button>;
};

const CookieConsentLink = ({ className, ...props }: React.ComponentProps<'a'>) => (
  <a data-slot="cookie-consent-link" className={cn('underline underline-offset-4 hover:text-foreground', className)} {...props} />
);

export {
  CookieConsent,
  CookieConsentTitle,
  CookieConsentDescription,
  CookieConsentManage,
  CookieConsentCategories,
  CookieConsentCategory,
  CookieConsentActions,
  CookieConsentAcceptAll,
  CookieConsentRejectAll,
  CookieConsentSave,
  CookieConsentLink,
};
