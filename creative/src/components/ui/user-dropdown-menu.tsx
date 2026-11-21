"use client";

import type { Icon as IconType } from '@/components/icons';
import { LogOutIcon } from '@/components/icons';
import { ProfileDot } from "@/components/ui/profile-dot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type UserMenuEntry = {
  label: string;
  icon: IconType;
  /** The page the person is on now. */
  current?: boolean;
  /** Shown at the right of the line. */
  aside?: string;
  onSelect: () => void;
};

type Props = {
  email: string;
  /** Entries in groups; a line is drawn between groups. */
  groups: readonly (readonly UserMenuEntry[])[];
  onSignOut: () => void;
};

const itemClass = "cursor-pointer gap-2 p-2 text-sm font-medium text-popover-foreground";

/**
 * 21st.dev "User Profile Dropdown Menu" (shadcnspace), adapted: the trigger is a black disc ringed in green, the menu
 * opens downwards from the top right, and the header shows the signed-in email.
 */
export function UserDropdownMenu({ email, groups, onSignOut }: Props) {
  return (
    // Not modal: a modal menu locks the page's scrolling, which removes the scrollbar and makes the whole page jump sideways.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="cursor-pointer rounded-full bg-transparent p-0 outline-ring focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <ProfileDot />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={12}
        className="w-64 rounded-[var(--radius-panel)] border-0 bg-muted shadow-[0_28px_56px_-24px_#000]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 px-4 py-3">
            <ProfileDot className="size-8 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">Signed in as</span>
              <span className="truncate text-sm font-medium text-popover-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>

          {groups.map((entries, index) => (
            <DropdownMenuGroup key={index}>
              <DropdownMenuSeparator />
              {entries.map(({ label, icon: Icon, current, aside, onSelect }) => (
                <DropdownMenuItem key={label} className={cn(itemClass, current && "text-primary")} onSelect={onSelect}>
                  <Icon size={20} />
                  <span>{label}</span>
                  {aside && <span className="ml-auto tabular-nums text-muted-foreground">{aside}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className={itemClass} onSelect={onSignOut}>
            <LogOutIcon size={20} />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
