import { forwardRef } from 'react';
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from '@hugeicons/react';
import {
  Add01Icon, AiBrain01Icon, Alert02Icon, Album01Icon, Album02Icon, Analytics01Icon, ArrowDown01Icon, ArrowLeft02Icon,
  ArrowRight01Icon, ArrowRight02Icon, AlertCircleIcon as HugeAlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon, CircleDashedIcon as HugeCircleDashedIcon, CircleIcon as HugeCircleIcon, Clock01Icon, CookieIcon as HugeCookieIcon, Copy01Icon,
  DashboardSquare02Icon, Delete02Icon, Download01Icon, DragDropVerticalIcon, GiftIcon as HugeGiftIcon, Image01Icon, Invoice03Icon,
  Link01Icon, LinkSquare02Icon, PanelLeftCloseIcon as HugePanelLeftCloseIcon, PanelLeftOpenIcon as HugePanelLeftOpenIcon, Loading03Icon, Logout03Icon, Mail01Icon, MusicNote03Icon, PauseIcon as HugePauseIcon,
  PencilEdit02Icon, PlayIcon as HugePlayIcon, Refresh01Icon, RotateLeft01Icon, Search01Icon, SecurityCheckIcon, Settings02Icon, Share08Icon,
  SmartPhone01Icon, SparklesIcon as HugeSparklesIcon, Tick02Icon, Upload01Icon, Video01Icon, ViewIcon, ViewOffIcon, Wallet02Icon,
} from '@hugeicons/core-free-icons';

/**
 * Every icon on the site, from one family: Hugeicons' free stroke-rounded set (MIT, via 21st.dev's icon library). Sized by their
 * classes (`size-4`), coloured by the text colour; a `fill-current` icon (the play button) is drawn solid.
 */
export type Icon = ReturnType<typeof make>;

function make(svg: IconSvgElement, name: string) {
  const icon = forwardRef<SVGSVGElement, Omit<HugeiconsProps, 'icon' | 'ref'>>(({ strokeWidth = 1.75, ...props }, ref) =>
    <HugeiconsIcon ref={ref} icon={svg} strokeWidth={strokeWidth} {...props} />);
  icon.displayName = name;
  return icon;
}

export const AlertCircleIcon = make(HugeAlertCircleIcon, 'AlertCircle');
export const AlertTriangleIcon = make(Alert02Icon, 'AlertTriangle');
export const ArrowLeftIcon = make(ArrowLeft02Icon, 'ArrowLeft');
export const ArrowRightIcon = make(ArrowRight02Icon, 'ArrowRight');
export const BarChart3Icon = make(Analytics01Icon, 'BarChart');
export const BrainIcon = make(AiBrain01Icon, 'Brain');
export const CheckIcon = make(Tick02Icon, 'Check');
export const CheckCircleIcon = make(CheckmarkCircle02Icon, 'CheckCircle');
export const ChevronDownIcon = make(ArrowDown01Icon, 'ChevronDown');
export const ChevronRightIcon = make(ArrowRight01Icon, 'ChevronRight');
export const CircleIcon = make(HugeCircleIcon, 'Circle');
export const CircleDashedIcon = make(HugeCircleDashedIcon, 'CircleDashed');
export const ClockIcon = make(Clock01Icon, 'Clock');
export const CookieIcon = make(HugeCookieIcon, 'Cookie');
export const CopyIcon = make(Copy01Icon, 'Copy');
export const DownloadIcon = make(Download01Icon, 'Download');
export const ExternalLinkIcon = make(LinkSquare02Icon, 'ExternalLink');
export const EyeIcon = make(ViewIcon, 'Eye');
export const EyeOffIcon = make(ViewOffIcon, 'EyeOff');
export const FilmIcon = make(Video01Icon, 'Film');
export const GiftIcon = make(HugeGiftIcon, 'Gift');
export const GripVerticalIcon = make(DragDropVerticalIcon, 'GripVertical');
export const HistoryIcon = make(Album02Icon, 'History');
export const ImageIcon = make(Image01Icon, 'Image');
export const ImagesIcon = make(Album01Icon, 'Images');
export const LayoutDashboardIcon = make(DashboardSquare02Icon, 'LayoutDashboard');
export const PanelLeftCloseIcon = make(HugePanelLeftCloseIcon, 'PanelLeftClose');
export const PanelLeftOpenIcon = make(HugePanelLeftOpenIcon, 'PanelLeftOpen');
export const Link2Icon = make(Link01Icon, 'Link');
export const LoaderCircleIcon = make(Loading03Icon, 'LoaderCircle');
export const LogOutIcon = make(Logout03Icon, 'LogOut');
export const MailIcon = make(Mail01Icon, 'Mail');
export const Music2Icon = make(MusicNote03Icon, 'Music');
export const PauseIcon = make(HugePauseIcon, 'Pause');
export const PencilIcon = make(PencilEdit02Icon, 'Pencil');
export const PlayIcon = make(HugePlayIcon, 'Play');
export const PlusIcon = make(Add01Icon, 'Plus');
export const ReceiptTextIcon = make(Invoice03Icon, 'ReceiptText');
export const RefreshIcon = make(Refresh01Icon, 'Refresh');
export const RotateCcwIcon = make(RotateLeft01Icon, 'RotateCcw');
export const SearchIcon = make(Search01Icon, 'Search');
export const SettingsIcon = make(Settings02Icon, 'Settings');
export const Share2Icon = make(Share08Icon, 'Share');
export const ShieldCheckIcon = make(SecurityCheckIcon, 'ShieldCheck');
export const SmartphoneIcon = make(SmartPhone01Icon, 'Smartphone');
export const SparklesIcon = make(HugeSparklesIcon, 'Sparkles');
export const Trash2Icon = make(Delete02Icon, 'Trash');
export const UploadIcon = make(Upload01Icon, 'Upload');
export const WalletIcon = make(Wallet02Icon, 'Wallet');
export const XIcon = make(Cancel01Icon, 'X');
