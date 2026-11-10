import { HistoryIcon, ReceiptTextIcon, SettingsIcon, SparklesIcon, WalletIcon, type LucideIcon } from 'lucide-react';

/** Everything the person can be looking at: making creatives, or one page of their account. */
export type AccountPage = 'create' | 'history' | 'invoices' | 'settings';

/** A line of the account menu: a page to go to, or the credit, which is only shown on its line. */
export type MenuLine = AccountPage | 'credit';

type Entry = { line: MenuLine; label: string; icon: LucideIcon };

/** The account menu: the way back to the main page, what they have, their credit and what they paid, then their settings. Sign out is separate. */
export const ACCOUNT_MENU: readonly (readonly Entry[])[] = [
  [
    { line: 'create', label: 'Create', icon: SparklesIcon },
    { line: 'history', label: 'History', icon: HistoryIcon },
    { line: 'credit', label: 'Credit', icon: WalletIcon },
    { line: 'invoices', label: 'Invoices', icon: ReceiptTextIcon },
  ],
  [{ line: 'settings', label: 'Settings', icon: SettingsIcon }],
];
