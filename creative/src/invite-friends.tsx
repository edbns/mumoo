import { CheckIcon, CopyIcon, Share2Icon } from '@/components/icons';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { accountFetch } from './account';
import { loadReferral, savedReferral, saveReferral, type ReferralInfo } from './referral';
import { friendlyError } from './friendly-error';

const COPIED_MS = 1500;

function Figure({ value, label }: { value: number; label: string }) {
  return <div className="flex flex-col items-center gap-1 rounded-[var(--radius-control)] bg-muted px-3 py-3 text-center">
    <span className="text-xl font-semibold text-foreground tabular-nums">{value.toLocaleString()}</span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>;
}

/**
 * Invite friends: the person's own link to share, what each side gets, and how their invites are doing. It is fetched as soon
 * as the person is signed in, so the popup opens whole; until it is there, the popup holds one placeholder for all of it.
 */
export function InviteFriends({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [info, setInfo] = useState<ReferralInfo | null>(() => savedReferral(userId));
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setError('');
    const saved = savedReferral(userId);
    if (saved) setInfo(saved);
    loadReferral(accountFetch).then(fresh => { if (live) { setInfo(fresh); saveReferral(userId, fresh); } },
      cause => { if (live && !saved) setError(friendlyError(cause, 'Your invite link is unavailable right now. Try again soon.')); });
    return () => { live = false; };
  }, [open, userId]);

  const copy = () => {
    if (!info) return;
    void navigator.clipboard.writeText(info.link).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); },
      () => setError('Browser blocked the copy. Select the link and copy it yourself.'),
    );
  };
  const share = () => {
    if (info) void navigator.share({ title: 'mumoo', text: `Make music videos with mumoo. First pack comes with ${info.videos} extra videos if they use my link.`, url: info.link }).catch(() => undefined);
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const videos = info?.videos ?? 10;

  return <Modal open={open} onClose={onClose} title="Invite friends" description={`Give ${videos} videos, get ${videos}.`}>
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        Share your link. Friend gets {videos} extra on their first pack, you get {videos} free once they pay.
      </p>
      {!info && !error && <div aria-busy="true" aria-label="Getting your invite link" className="flex flex-col gap-4">
        <div className="h-10 animate-pulse rounded-[var(--radius-control)] bg-muted" />
        <div className="h-[4.25rem] animate-pulse rounded-[var(--radius-control)] bg-muted" />
      </div>}
      {info && <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-muted py-1 pr-1 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" aria-label="Your invite link">{info.link}</span>
        <Button size="sm" disabled={!info} onClick={copy} aria-live="polite">
          {copied ? <CheckIcon aria-hidden="true" className="size-4" /> : <CopyIcon aria-hidden="true" className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare && <Button size="sm" variant="secondary" disabled={!info} onClick={share} aria-label="Share your invite link">
          <Share2Icon aria-hidden="true" className="size-4" />
        </Button>}
      </div>}
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {info && <div className="grid grid-cols-3 gap-2">
        <Figure value={info.joined} label="Joined" />
        <Figure value={info.bought} label="Paid" />
        <Figure value={info.earned} label="You earned" />
      </div>}
    </div>
  </Modal>;
}
