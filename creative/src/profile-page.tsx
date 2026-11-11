import type { AccountPage } from './account-pages';
import HistoryPage from './history-page';
import InvoicesPage from './invoices-page';
import type { ProfileTab } from './profile-nav';
import type { DownloadProgress } from './use-cart-download';
import SettingsPage from './settings-page';

/** The pages of the person's account, shown in the same layer as the main screen. */
export default function ProfilePage({ page, tab, progress, delivered }: { page: Exclude<AccountPage, 'create'>; tab: ProfileTab; progress: DownloadProgress | null; delivered: number }) {
  switch (page) {
    case 'history': return <HistoryPage tab={tab} progress={progress} delivered={delivered} />;
    case 'invoices': return <InvoicesPage />;
    case 'settings': return <SettingsPage />;
  }
}
