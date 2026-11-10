import NumberFlow from "@number-flow/react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type CreditPack = {
  usd: number;
  tokens: number;
  /** Marks the pack most people take. */
  popular?: boolean;
};

const CARD = "5rem";
const GAP = "0.75rem";

/**
 * 21st.dev "Pricing Interaction", adapted: it sells credit packs (one price each, no plans or periods), in the theme's
 * colours. The outline slides to the pack chosen, and the button's amounts roll to match.
 */
export function PricingInteraction({
  packs,
  onChoose,
}: {
  packs: readonly CreditPack[];
  onChoose: (pack: CreditPack) => void;
}) {
  const [active, setActive] = React.useState(Math.max(0, packs.findIndex((pack) => pack.popular)));
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
            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-muted px-5 text-left outline-ring focus-visible:outline-2"
            style={{ height: CARD }}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2 text-xl font-semibold text-foreground">
                {pack.tokens.toLocaleString()} tokens
                {pack.popular && (
                  <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Popular</span>
                )}
              </span>
              <span className="text-sm text-muted-foreground">${pack.usd}</span>
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
          className="pointer-events-none absolute top-0 left-0 w-full rounded-2xl border-[3px] border-primary transition-transform duration-300"
          style={{ height: CARD, transform: `translateY(calc(${active} * (${CARD} + ${GAP})))` }}
        />
      </div>
      <button
        type="button"
        onClick={() => onChoose(chosen)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary p-3 text-lg font-semibold text-primary-foreground transition-transform duration-300 active:scale-95"
      >
        Buy <NumberFlow value={chosen.tokens} /> tokens · $<NumberFlow value={chosen.usd} />
      </button>
    </div>
  );
}
