import NumberFlow from "@number-flow/react";
import * as React from "react";
import { perVideo, type CreditPack } from "@/credit-packs";
import { cn } from "@/lib/utils";

const CARD = "5rem";
const GAP = "0.75rem";

/**
 * 21st.dev "Pricing Interaction", adapted: it sells credit packs (one price each, no plans or periods; 1 credit = 1 video), in the theme's
 * colours. The outline slides to the pack chosen, and the button's amounts roll to match.
 */
export function PricingInteraction({
  packs,
  initial,
  busy = false,
  onChoose,
}: {
  packs: readonly CreditPack[];
  /** The pack chosen at first (its price in dollars); otherwise the popular one. */
  initial?: number;
  /** While the checkout is being opened: the button waits. */
  busy?: boolean;
  onChoose: (pack: CreditPack) => void;
}) {
  const [active, setActive] = React.useState(() => {
    const at = packs.findIndex((pack) => (initial ? pack.usd === initial : pack.popular));
    return Math.max(0, at);
  });
  const chosen = packs[active];

  return (
    <div className="flex w-full flex-col gap-4">
      <div role="radiogroup" aria-label="Credit packs" className="relative flex flex-col" style={{ gap: GAP }}>
        {packs.map((pack, index) => (
          <button
            key={pack.usd}
            type="button"
            role="radio"
            aria-checked={index === active}
            onClick={() => setActive(index)}
            className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-panel)] bg-muted px-5 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]"
            style={{ height: CARD }}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2 text-xl font-semibold text-foreground">
                {pack.videos.toLocaleString()} videos
                {pack.popular && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Popular</span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">${pack.usd} · {perVideo(pack)} a video</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-colors duration-300",
                index === active ? "border-primary" : "border-muted-foreground/50",
              )}
            >
              <span
                className={cn("size-3 rounded-full bg-primary transition-opacity duration-300", index === active ? "opacity-100" : "opacity-0")}
              />
            </span>
          </button>
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 w-full rounded-[var(--radius-panel)] border-2 border-primary transition-transform duration-300"
          style={{ height: CARD, transform: `translateY(calc(${active} * (${CARD} + ${GAP})))` }}
        />
      </div>
      <button
        type="button"
        onClick={() => onChoose(chosen)}
        disabled={busy}
        aria-busy={busy}
        className="flex h-[var(--control-height-md)] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-medium text-primary-foreground outline-ring transition-colors hover:bg-primary/90 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? "Opening checkout…" : <>Buy <NumberFlow value={chosen.videos} /> videos · <NumberFlow value={chosen.usd} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} /></>}
      </button>
    </div>
  );
}
