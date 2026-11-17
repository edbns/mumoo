import { HistoryIcon, LayoutListIcon, Link2Icon, ReceiptTextIcon, SettingsIcon, SparklesIcon, WalletIcon, type LucideIcon } from 'lucide-react';

/**
 * Everything the person can be looking at: making creatives, making a smart link (open signed out too) or their smart links, or one
 * page of their account.
 */
export type AccountPage = 'create' | 'links' | 'my-links' | 'history' | 'invoices' | 'settings';

/** The pages with their own address, to share and come back to; every other page is at the root. */
export const PAGE_PATHS: Partial<Record<AccountPage, string>> = { links: '/links', 'my-links': '/links/mine' };
export const pageAt = (path: string): AccountPage =>
  (Object.entries(PAGE_PATHS).find(([, at]) => at === path.replace(/\/+$/, ''))?.[0] as AccountPage | undefined) ?? 'create';

/** A line of the account menu: a page to go to, or the credit, which is only shown on its line. */
export type MenuLine = AccountPage | 'credit';

type Entry = { line: MenuLine; label: string; icon: LucideIcon };

/** The account menu: the way back to the main page, what they have, their credit and what they paid, then their settings. Sign out is separate. */
export const ACCOUNT_MENU: readonly (readonly Entry[])[] = [
  [
    { line: 'create', label: 'Create', icon: SparklesIcon },
    { line: 'history', label: 'History', icon: HistoryIcon },
  ],
  [
    { line: 'links', label: 'Create Smart Link', icon: Link2Icon },
    { line: 'my-links', label: 'My Smart Links', icon: LayoutListIcon },
  ],
  [
    { line: 'credit', label: 'Credit', icon: WalletIcon },
    { line: 'invoices', label: 'Invoices', icon: ReceiptTextIcon },
  ],
  [{ line: 'settings', label: 'Settings', icon: SettingsIcon }],
];
