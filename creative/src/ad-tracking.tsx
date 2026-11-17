import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { AccountSection } from './account-section';
import { textButton } from './smart-link-parts';
import type { AdIds, AdTokens, TokenField } from './smart-links';

const field = 'h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-control)] bg-muted px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_2px_var(--focus-ring)]';

/**
 * The link's own ad accounts, in Create Smart Link and saved with the link. Visits and stream clicks are then sent to them from our
 * server (Meta's Conversions API, TikTok's Events API), so the fan page stays free of their scripts. Tokens are write-only: once
 * saved, only that they are set is shown, and they are never kept in the browser's draft.
 */
export function AdTracking({ ids, saved, tokens, onIds, onTokens }: {
  ids: AdIds; saved: Record<TokenField, boolean>; tokens: AdTokens;
  onIds: (ids: AdIds) => void; onTokens: (tokens: AdTokens) => void;
}) {
  const connected = Boolean(ids.meta_pixel_id || ids.tiktok_pixel_id || ids.google_ads_id || saved.meta_capi_token || saved.tiktok_events_token);
  const [open, setOpen] = useState(connected);
  const has = (token: TokenField) => tokens[token] === undefined ? saved[token] : Boolean(tokens[token]);

  return <AccountSection label="Ad tracking" aside={<button type="button" className={`${textButton} inline-flex items-center gap-1`} aria-expanded={open}
    onClick={() => setOpen(!open)}>{open ? 'Hide' : connected ? 'Show' : 'Set up'}<ChevronDownIcon aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>}>
    <p className="m-0 text-sm text-muted-foreground">
      Optional. Running ads? Connect your accounts and every visit and stream click is sent to them from our server, so they can
      measure and optimise your campaigns. No pixel is added to your page. Ad visits are recognised and counted either way.
    </p>
    {open && <div className="flex flex-col gap-3">
      <Platform name="Meta" status={ids.meta_pixel_id && has('meta_capi_token') ? 'Sends PageView and StreamClick' : null}>
        <Labelled label="Pixel ID"><input className={field} inputMode="numeric" value={ids.meta_pixel_id} placeholder="e.g. 1234567890123456"
          onChange={event => onIds({ ...ids, meta_pixel_id: event.target.value.trim() })} /></Labelled>
        <Token label="Conversions API token" field="meta_capi_token" saved={saved.meta_capi_token} tokens={tokens} onTokens={onTokens} />
      </Platform>
      <Platform name="TikTok" status={ids.tiktok_pixel_id && has('tiktok_events_token') ? 'Sends ViewContent and StreamClick' : null}>
        <Labelled label="Pixel ID"><input className={field} value={ids.tiktok_pixel_id} placeholder="e.g. C1A2B3C4D5E6F7G8H9"
          onChange={event => onIds({ ...ids, tiktok_pixel_id: event.target.value.trim() })} /></Labelled>
        <Token label="Events API access token" field="tiktok_events_token" saved={saved.tiktok_events_token} tokens={tokens} onTokens={onTokens} />
      </Platform>
      <Platform name="Google Ads" status={null}>
        <Labelled label="Google Ads ID"><input className={field} value={ids.google_ads_id} placeholder="e.g. AW-123456789"
          onChange={event => onIds({ ...ids, google_ads_id: event.target.value.trim() })} /></Labelled>
        <p className="m-0 self-end text-xs text-muted-foreground">Google Ads clicks are recognised and counted. Sending conversions to Google needs its own API access, coming later.</p>
      </Platform>
    </div>}
  </AccountSection>;
}

function Platform({ name, status, children }: { name: string; status: string | null; children: ReactNode }) {
  return <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border-0 bg-card p-4">
    <legend className="contents">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{name}</span>
        <span className={`text-xs ${status ? 'text-primary' : 'text-muted-foreground'}`}>{status ?? 'Not connected'}</span>
      </span>
    </legend>
    <div className="grid items-start gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return <label className="m-0 flex flex-col gap-1.5 text-xs font-normal text-muted-foreground">{label}{children}</label>;
}

function Token({ label, field: name, saved, tokens, onTokens }: {
  label: string; field: TokenField; saved: boolean; tokens: AdTokens; onTokens: (tokens: AdTokens) => void;
}) {
  const removed = tokens[name] === null;
  const set = (value: string | null | undefined) => { const next = { ...tokens }; if (value === undefined) delete next[name]; else next[name] = value; onTokens(next); };
  return <Labelled label={label}>
    <input className={field} type="password" autoComplete="off" value={tokens[name] ?? ''}
      placeholder={removed ? 'Removed when you save' : saved ? 'Saved · paste to replace' : 'Paste your token'}
      onChange={event => set(event.target.value || undefined)} />
    {saved && <button type="button" onClick={() => set(removed ? undefined : null)}
      className="cursor-pointer self-start bg-transparent p-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
      {removed ? 'Keep the saved token' : 'Remove token'}
    </button>}
  </Labelled>;
}
