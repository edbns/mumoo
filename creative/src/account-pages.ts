import { GiftIcon, HistoryIcon, Link2Icon, ReceiptTextIcon, SettingsIcon, SparklesIcon, WalletIcon, type LucideIcon } from 'lucide-react';

/**
 * Everything the person can be looking at: making creatives, making a smart link (open signed out too) or their smart links, or one
 * page of their account.
 */
export type AccountPage = 'create' | 'links' | 'my-links' | 'history' | 'invoices' | 'settings';

/** Every page but Create has its own address, so a refresh or a shared link comes back to it; Create is at the root. */
export const PAGE_PATHS: Partial<Record<AccountPage, string>> = {
  links: '/links', 'my-links': '/links/mine', history: '/media', invoices: '/invoices', settings: '/settings',
};
/** Media's second tab, Your uploads. */
export const UPLOADS_PATH = '/media/uploads';
const clean = (path: string) => path.replace(/\/+$/, '');
export const pageAt = (path: string): AccountPage => clean(path) === UPLOADS_PATH ? 'history'
  : (Object.entries(PAGE_PATHS).find(([, at]) => at === clean(path))?.[0] as AccountPage | undefined) ?? 'create';
export const uploadsAt = (path: string) => clean(path) === UPLOADS_PATH;

/** A line of the account menu: a page to go to, or a popup (the credit, shown on its line, and Invite friends). */
export type MenuLine = AccountPage | 'credit' | 'invite';

type Entry = { line: MenuLine; label: string; icon: LucideIcon };

/** The account menu: the way back to the main page, what they have, their credit, inviting friends and what they paid, then their settings. Sign out is separate. */
export const ACCOUNT_MENU: readonly (readonly Entry[])[] = [
  [
    { line: 'create', label: 'Create', icon: SparklesIcon },
    { line: 'history', label: 'Media', icon: HistoryIcon },
    { line: 'links', label: 'Smart Links', icon: Link2Icon },
  ],
  [
    { line: 'credit', label: 'Credit', icon: WalletIcon },
    { line: 'invite', label: 'Invite friends', icon: GiftIcon },
    { line: 'invoices', label: 'Invoices', icon: ReceiptTextIcon },
  ],
  [{ line: 'settings', label: 'Settings', icon: SettingsIcon }],
];
