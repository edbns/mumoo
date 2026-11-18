import { cn } from "@/lib/utils";

/**
 * Where the profile button sits: the bottom left of the rounded layer, as far in from its edges as the top-right actions
 * (`.masthead-actions`), so it stays clear of the layer's corner.
 */
export const PROFILE_CORNER = "fixed bottom-8 left-10 z-[5]";

/** The signed-in person: a black disc ringed in the theme's green. */
export function ProfileDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block size-9 rounded-full bg-black ring-2 ring-primary", className)} />;
}
