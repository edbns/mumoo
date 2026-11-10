import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { PricingInteraction, type CreditPack } from '@/components/ui/pricing-interaction';

/** Placeholder amounts: the number of tokens in each pack is not decided yet. */
const PACKS: readonly CreditPack[] = [
  { usd: 5, tokens: 50 },
  { usd: 10, tokens: 110, popular: true },
  { usd: 15, tokens: 180 },
];

/** The popup for topping up credit. Payments are not connected yet, so choosing a pack says so. */
export function PurchaseCredits({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  return <Modal open={open} onClose={() => { setNote(''); onClose(); }} title="Purchase Credits" description="Top up your credit balance to generate visuals.">
    <div className="flex flex-col gap-4">
      <PricingInteraction packs={PACKS} onChoose={() => setNote('Payments are not switched on yet.')} />
      {note && <p role="status" className="m-0 text-center text-sm text-muted-foreground">{note}</p>}
      <p className="m-0 text-center text-sm text-muted-foreground">One-time purchase, no subscription. Credit never expires.</p>
    </div>
  </Modal>;
}
