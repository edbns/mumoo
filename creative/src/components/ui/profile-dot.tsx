import { cn } from "@/lib/utils";

/** Where the profile button sits: last of the top-right actions (`.masthead-actions`). */
export const PROFILE_CORNER = "flex";

/** The signed-in person: a black disc ringed in the theme's green. */
export function ProfileDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block size-9 rounded-full bg-black ring-2 ring-primary", className)} />;
}
