import type { AccountPage } from './account-pages';
import HistoryPage from './history-page';
import InvoicesPage from './invoices-page';
import LinksPage from './links-page';
import MyLinksPage from './my-links-page';
import type { ProfileTab } from './profile-nav';
import type { DownloadProgress } from './use-cart-download';
import SettingsPage from './settings-page';

/** The pages of the person's account, shown in the same layer as the main screen. */
export default function ProfilePage({ page, tab, progress, delivered, onNavigate }: {
  page: Exclude<AccountPage, 'create'>; tab: ProfileTab; progress: DownloadProgress | null; delivered: number; onNavigate: (page: AccountPage) => void;
}) {
  switch (page) {
    case 'history': return <HistoryPage tab={tab} progress={progress} delivered={delivered} />;
    case 'links': return <LinksPage onNavigate={onNavigate} />;
    case 'my-links': return <MyLinksPage onNavigate={onNavigate} />;
    case 'invoices': return <InvoicesPage />;
    case 'settings': return <SettingsPage />;
  }
}
