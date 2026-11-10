import { NotchNav } from './notch-nav';

export type ProfileTab = 'creatives' | 'uploads';
const TABS = [
  { id: 'creatives', label: 'Creatives' },
  { id: 'uploads', label: 'Your uploads' },
] as const;

/** The two kinds of things kept in the history, one of them shown at a time. */
export function ProfileNav({ current, onSelect }: { current: ProfileTab; onSelect: (tab: ProfileTab) => void }) {
  return <NotchNav label="History" items={TABS} current={current} onSelect={onSelect} />;
}
