import { CheckIcon, CopyIcon, Share2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { accountFetch } from './account';
import { loadReferral, savedReferral, saveReferral, type ReferralInfo } from './referral';

const COPIED_MS = 1500;

function Figure({ value, label }: { value: number; label: string }) {
  return <div className="flex flex-col items-center gap-1 rounded-[var(--radius-control)] bg-muted px-3 py-3 text-center">
    <span className="text-xl font-semibold text-foreground tabular-nums">{value.toLocaleString()}</span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>;
}

/** Invite friends: the person's own link to share, what each side gets, and how their invites are doing. */
export function InviteFriends({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [info, setInfo] = useState<ReferralInfo | null>(() => savedReferral(userId));
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    const saved = savedReferral(userId);
    if (saved) setInfo(saved);
    loadReferral(accountFetch).then(fresh => { setInfo(fresh); saveReferral(userId, fresh); }, cause => { if (!saved) setError((cause as Error).message); });
  }, [open, userId]);

  const copy = () => {
    if (!info) return;
    void navigator.clipboard.writeText(info.link).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), COPIED_MS); },
      () => setError('Browser blocked the copy. Select the link and copy it yourself.'),
    );
  };
  const share = () => {
    if (info) void navigator.share({ title: 'mumoo', text: `Make music videos with MUMOO. First pack comes with ${info.videos} extra videos if they use my link.`, url: info.link }).catch(() => undefined);
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const videos = info?.videos ?? 10;

  return <Modal open={open} onClose={onClose} title="Invite friends" description={`Give ${videos} videos, get ${videos}.`}>
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        Share your link. Friend gets {videos} extra on their first pack, you get {videos} free once they pay.
      </p>
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] bg-muted py-1 pr-1 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" aria-label="Your invite link">{info?.link ?? (error ? '' : 'Getting your link…')}</span>
        <Button size="sm" disabled={!info} onClick={copy} aria-live="polite">
          {copied ? <CheckIcon aria-hidden="true" className="size-4" /> : <CopyIcon aria-hidden="true" className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare && <Button size="sm" variant="secondary" disabled={!info} onClick={share} aria-label="Share your invite link">
          <Share2Icon aria-hidden="true" className="size-4" />
        </Button>}
      </div>
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      {info && <>
        <div className="grid grid-cols-3 gap-2">
          <Figure value={info.joined} label={info.joined === 1 ? 'friend joined' : 'friends joined'} />
          <Figure value={info.bought} label="bought a pack" />
          <Figure value={info.earned} label="videos earned" />
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          {info.thisMonth >= info.cap
            ? `You’ve hit this month’s limit of ${info.cap} rewarded friends. Friends who join still get their ${videos} ; your rewards reset on the 1st.`
            : `${info.thisMonth} of ${info.cap} friends this month have earned you videos. Your friends always get theirs.`}
        </p>
      </>}
    </div>
  </Modal>;
}
