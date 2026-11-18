import { ProgressiveFluxLoader, type ProgressiveFluxPhase } from '@/components/ui/progressive-flux-loader';
import type { DownloadProgress } from './use-cart-download';

const PHASES: ProgressiveFluxPhase[] = [
  { at: 0, label: 'Warming up' },
  { at: 8, label: 'Drawing every frame' },
  { at: 50, label: 'Putting it to your song' },
  { at: 82, label: 'Almost there' },
  { at: 100, label: 'Getting your download' },
];

/** The creatives being made: the phase, the green bar, how many are done, and what to expect. */
export function RenderProgress({ progress, note }: { progress: DownloadProgress; note: string }) {
  return <div role="status" className="flex flex-col items-center gap-4 rounded-[var(--radius-panel)] bg-background px-5 py-8 text-center">
    <ProgressiveFluxLoader value={progress.percent} phases={PHASES} className="gap-5 [--flux-from:var(--primary)] [--flux-to:#d4ff9a]"
      textClassName="text-xl font-semibold text-foreground sm:text-2xl" barClassName="h-3" />
    <p className="m-0 text-sm text-muted-foreground"><span className="text-foreground">{progress.label}</span> · {note}</p>
  </div>;
}
