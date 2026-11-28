import { useEffect, useState } from 'react';
import { RefreshIcon } from '@/components/icons';
import { loadRecords, type LinkRow, type OrderRow, type PersonRow, type Records, type ReferralRow, type UploadRow, type VideoRow } from './api';
import { Badge, DataTable, type Column } from './data-table';
import { formatBytes, formatDate, formatMoney, formatNumber, formatSeconds } from './kit';

/** One list from the server, loaded when its page opens; Reload asks again. */
function useRecords<K extends keyof Records>(list: K) {
  const [rows, setRows] = useState<Records[K][] | null>(null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    loadRecords(list).then(result => { if (live) { setRows(result.rows); setLimit(result.limit); } }, (cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [list, round]);
  return { rows, limit, error, reload: () => setRound(count => count + 1) };
}

function Page<K extends keyof Records>({ list, title, intro, children }: {
  list: K; title: string; intro: string; children: (rows: Records[K][]) => React.ReactNode;
}) {
  const { rows, limit, error, reload } = useRecords(list);
  return <div className="mx-auto flex max-w-[110rem] flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-2xl font-semibold">{title}</h1>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{intro}{rows && rows.length >= limit ? ` Only the newest ${formatNumber(limit)} are listed.` : ''}</p>
      </div>
      <button type="button" onClick={reload} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
        <RefreshIcon className="size-3.5" aria-hidden="true" />Reload
      </button>
    </header>
    {error && <p role="alert" className="m-0 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
    {!rows && !error && <div className="h-96 animate-pulse rounded-2xl bg-card/70" />}
    {rows && children(rows)}
  </div>;
}

const yes = (value: boolean) => (value ? 'Yes' : 'No');

const PEOPLE: Column<PersonRow>[] = [
  { key: 'member_no', label: 'No.', align: 'right' },
  { key: 'email', label: 'Email' },
  { key: 'created_at', label: 'Joined', cell: row => formatDate(row.created_at) },
  { key: 'last_seen_at', label: 'Last seen', cell: row => formatDate(row.last_seen_at) },
  { key: 'videos', label: 'Videos', align: 'right' },
  { key: 'orders', label: 'Orders', align: 'right' },
  { key: 'spent_cents', label: 'Spent', align: 'right', cell: row => formatMoney(row.spent_cents), text: row => (row.spent_cents / 100).toFixed(2) },
  { key: 'credits_bought', label: 'Credits bought', align: 'right', wide: true },
  { key: 'credits_given', label: 'Credits given', align: 'right', wide: true },
  { key: 'credits_used', label: 'Credits used', align: 'right', wide: true },
  { key: 'free_used', label: 'Free video', cell: row => (row.free_used ? <Badge tone="good">Used</Badge> : <Badge>Not yet</Badge>), text: row => yes(row.free_used) },
  { key: 'uploads', label: 'Uploads', align: 'right', wide: true },
  { key: 'stored_bytes', label: 'Storage', align: 'right', cell: row => formatBytes(row.stored_bytes), wide: true },
  { key: 'links', label: 'Smart links', align: 'right', wide: true },
  { key: 'referred_by', label: 'Invited by', wide: true },
];

const ORDERS: Column<OrderRow>[] = [
  { key: 'paid_at', label: 'Paid', cell: row => formatDate(row.paid_at) },
  { key: 'invoice_number', label: 'Invoice' },
  { key: 'email', label: 'Email' },
  { key: 'videos', label: 'Credits', align: 'right' },
  { key: 'amount', label: 'Amount', align: 'right', cell: row => formatMoney(row.amount, row.currency), text: row => (row.amount / 100).toFixed(2) },
  { key: 'currency', label: 'Currency', wide: true },
  { key: 'status', label: 'Status', cell: row => <Badge tone={row.status === 'paid' ? 'good' : 'muted'}>{row.status === 'paid' ? 'Paid' : 'Refunded'}</Badge> },
  { key: 'refunded_at', label: 'Refunded', cell: row => formatDate(row.refunded_at), wide: true },
  { key: 'id', label: 'Order id', wide: true },
];

const VIDEO_STATUS: Record<VideoRow['status'], { label: string; tone: 'good' | 'bad' | 'busy' | 'muted' }> = {
  done: { label: 'Made', tone: 'good' }, failed: { label: 'Failed', tone: 'bad' }, cancelled: { label: 'Cancelled', tone: 'muted' },
  queued: { label: 'Waiting', tone: 'busy' }, starting: { label: 'Starting', tone: 'busy' }, running: { label: 'Making', tone: 'busy' },
};
const VIDEOS: Column<VideoRow>[] = [
  { key: 'created_at', label: 'Asked for', cell: row => formatDate(row.created_at) },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status', cell: row => <Badge tone={VIDEO_STATUS[row.status].tone}>{VIDEO_STATUS[row.status].label}</Badge>, text: row => VIDEO_STATUS[row.status].label },
  { key: 'free', label: 'Free', cell: row => (row.free ? <Badge tone="good">Free</Badge> : '–'), text: row => yes(row.free) },
  { key: 'wait_s', label: 'Waited', align: 'right', cell: row => formatSeconds(row.wait_s) },
  { key: 'make_s', label: 'Made in', align: 'right', cell: row => formatSeconds(row.make_s) },
  { key: 'attempts', label: 'Tries', align: 'right', wide: true },
  { key: 'finished_at', label: 'Finished', cell: row => formatDate(row.finished_at), wide: true },
  { key: 'error', label: 'Error', cell: row => (row.error ? <span className="block max-w-80 truncate text-destructive" title={row.error}>{row.error}</span> : '–'), wide: true },
  { key: 'id', label: 'Video id', wide: true },
];

const LINKS: Column<LinkRow>[] = [
  { key: 'created_at', label: 'Created', cell: row => formatDate(row.created_at) },
  { key: 'title', label: 'Song', cell: row => <span><span className="font-medium">{row.title}</span> <span className="text-muted-foreground">· {row.artist}</span></span> },
  { key: 'artist', label: 'Artist', wide: true },
  { key: 'email', label: 'Email' },
  { key: 'slug', label: 'Address', cell: row => <a href={`/l/${row.slug}`} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">/l/{row.slug}</a> },
  { key: 'views', label: 'Views', align: 'right' },
  { key: 'clicks', label: 'Clicks', align: 'right' },
  { key: 'top_service', label: 'Top platform', wide: true },
  { key: 'ad_tracking', label: 'Ad tracking', cell: row => (row.ad_tracking ? <Badge tone="good">On</Badge> : '–'), text: row => yes(row.ad_tracking), wide: true },
  { key: 'updated_at', label: 'Edited', cell: row => formatDate(row.updated_at), wide: true },
];

const UPLOADS: Column<UploadRow>[] = [
  { key: 'created_at', label: 'Uploaded', cell: row => formatDate(row.created_at) },
  { key: 'email', label: 'Email' },
  { key: 'kind', label: 'Kind', cell: row => (row.kind === 'photo' ? 'Photo' : 'Video') },
  { key: 'status', label: 'Status', cell: row => <Badge tone={row.status === 'ready' ? 'good' : row.status === 'failed' ? 'bad' : 'busy'}>{row.status === 'ready' ? 'Ready' : row.status === 'failed' ? 'Failed' : 'Preparing'}</Badge> },
  { key: 'bytes', label: 'Size', align: 'right', cell: row => formatBytes(row.bytes) },
  { key: 'error', label: 'Error', wide: true },
  { key: 'id', label: 'Upload id', wide: true },
];

const REFERRALS: Column<ReferralRow>[] = [
  { key: 'created_at', label: 'Joined', cell: row => formatDate(row.created_at) },
  { key: 'friend', label: 'Friend' },
  { key: 'referrer', label: 'Invited by' },
  { key: 'rewarded_at', label: 'Rewarded', cell: row => (row.rewarded_at ? formatDate(row.rewarded_at) : <Badge>Not yet</Badge>) },
  { key: 'order_id', label: 'First order', wide: true },
];

export function PeopleView() {
  return <Page list="people" title="People" intro="Everyone who signed up, with what they bought, made and keep.">
    {rows => <DataTable rows={rows} columns={PEOPLE} name="people" initialSort={[{ id: 'created_at', desc: true }]} empty="Nobody has signed up yet." />}
  </Page>;
}

export function OrdersView() {
  return <Page list="orders" title="Orders" intro="Every credit pack bought, and the ones refunded.">
    {rows => <DataTable rows={rows} columns={ORDERS} name="orders" initialSort={[{ id: 'paid_at', desc: true }]} empty="No orders yet."
      facet={{ key: 'status', label: 'Status', values: [{ value: 'paid', label: 'Paid' }, { value: 'refunded', label: 'Refunded' }] }} />}
  </Page>;
}

export function VideosView() {
  return <Page list="videos" title="Videos" intro="Every video asked for: how long it waited, how long it took, and why one failed.">
    {rows => <DataTable rows={rows} columns={VIDEOS} name="videos" initialSort={[{ id: 'created_at', desc: true }]} empty="No videos yet."
      facet={{ key: 'status', label: 'Status', values: (['done', 'failed', 'cancelled', 'queued', 'running'] as const).map(value => ({ value, label: VIDEO_STATUS[value].label })) }} />}
  </Page>;
}

export function LinksView() {
  return <Page list="links" title="Smart links" intro="Every smart link published, with its views and clicks.">
    {rows => <DataTable rows={rows} columns={LINKS} name="smart-links" initialSort={[{ id: 'created_at', desc: true }]} empty="No smart links yet." />}
  </Page>;
}

export function UploadsView() {
  return <Page list="uploads" title="Uploads" intro="Photos and videos people uploaded to use in their videos.">
    {rows => <DataTable rows={rows} columns={UPLOADS} name="uploads" initialSort={[{ id: 'created_at', desc: true }]} empty="No uploads yet."
      facet={{ key: 'status', label: 'Status', values: [{ value: 'ready', label: 'Ready' }, { value: 'preparing', label: 'Preparing' }, { value: 'failed', label: 'Failed' }] }} />}
  </Page>;
}

export function ReferralsView() {
  return <Page list="referrals" title="Referrals" intro="Friends who joined with someone’s link, and whether their first pack rewarded both.">
    {rows => <DataTable rows={rows} columns={REFERRALS} name="referrals" initialSort={[{ id: 'created_at', desc: true }]} empty="Nobody has joined with a friend’s link yet." />}
  </Page>;
}
