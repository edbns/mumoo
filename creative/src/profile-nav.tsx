import type { AccountPage } from './account-pages';
import { NotchNav } from './notch-nav';

export type ProfileTab = 'creatives' | 'uploads';
const TABS = [
  { id: 'creatives', label: 'Creatives' },
  { id: 'uploads', label: 'Your uploads' },
] as const;

/** The two kinds of things kept in the history, one of them shown at a time. */
export function ProfileNav({ current, onSelect }: { current: ProfileTab; onSelect: (tab: ProfileTab) => void }) {
  return <NotchNav label="Media" items={TABS} current={current} onSelect={onSelect} />;
}

export type LinksTab = Extract<AccountPage, 'links' | 'my-links'>;
const LINKS_TABS = [
  { id: 'links', label: 'Create Smart Link' },
  { id: 'my-links', label: 'My Smart Links' },
] as const;

/** Smart links, split the same way: making one, or the ones already made. */
export function LinksNav({ current, onSelect }: { current: LinksTab; onSelect: (tab: LinksTab) => void }) {
  return <NotchNav label="Smart links" items={LINKS_TABS} current={current} onSelect={onSelect} />;
}
