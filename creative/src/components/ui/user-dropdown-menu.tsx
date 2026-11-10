"use client";

import type { LucideIcon } from "lucide-react";
import { LogOutIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  icon: LucideIcon;
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
 * 21st.dev "User Profile Dropdown Menu" (shadcnspace), adapted: the trigger is the profile icon ringed in green, the menu
 * opens upwards because the trigger sits at the bottom left, and the header shows the signed-in email.
 */
export function UserDropdownMenu({ email, groups, onSignOut }: Props) {
  return (
    // Not modal: a modal menu locks the page's scrolling, which removes the scrollbar and makes the whole page jump sideways.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="cursor-pointer rounded-full bg-transparent p-0 outline-ring focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <Avatar className="size-11 ring-2 ring-primary ring-offset-2 ring-offset-background">
          <AvatarFallback className="bg-card text-foreground">
            <UserRoundIcon aria-hidden="true" className="size-5" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-64 rounded-2xl border-0 shadow-2xl shadow-black/60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-10 ring-2 ring-primary">
              <AvatarFallback className="bg-card text-foreground">
                <UserRoundIcon aria-hidden="true" className="size-5" />
              </AvatarFallback>
            </Avatar>
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
