import { ArrowRightIcon } from '@/components/icons';
import type { CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import type { Published } from './smart-links';
import { useFreeVideo } from './use-free-video';

const WORD_STEP_S = 0.45;

/**
 * The next step once a smart link is live: the song as a 9:16 promo video (its own cover and title, lit word by word), and the
 * way into the studio with the song handed over. Shown right after publishing, when the artist is about to promote.
 */
export function AdsNextStep({ published, onStart }: { published: Published; onStart: () => void }) {
  const { title } = published.link;
  const free = useFreeVideo() === true;
  return <div className="grid flex-1 content-center items-center gap-8 rounded-[var(--radius-control)] bg-card p-6 sm:grid-cols-[auto_minmax(0,1fr)]">
    <AdMockup published={published} />
    <div className="flex min-w-0 flex-col items-start gap-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-widest text-primary">Promote this release</p>
      <p className="m-0 text-2xl font-semibold leading-tight">Turn “{title}” into beat-cut promo videos.</p>
      <p className="m-0 text-base text-muted-foreground">
        Drop the audio and get 10 to 15 second videos for Reels, TikTok, and Shorts—matched to your sound, with optional synced lyrics.{free && ' First video free—no watermark.'}
      </p>
      <Button className="shimmer relative h-[var(--control-height-md)] overflow-hidden px-5" onClick={onStart}>
        {free ? 'Make my first video free' : 'Create videos'}<ArrowRightIcon aria-hidden="true" className="size-4" />
      </Button>
    </div>
  </div>;
}

/** A phone-sized 9:16 frame: the cover blurred behind, the cover, and the title as a lyric line. Drawn from the link alone. */
function AdMockup({ published }: { published: Published }) {
  const { title, artist, cover } = published.link;
  const words = title.split(/\s+/).filter(Boolean).slice(0, 6);
  const cycle = `${Math.max(3, words.length * WORD_STEP_S + 1.5)}s`;
  return <div aria-hidden="true" className="relative mx-auto aspect-[9/16] w-44 shrink-0 overflow-hidden rounded-[14px] bg-black shadow-[0_10px_30px_rgba(0,0,0,0.5)] sm:mx-0">
    {cover && <img src={cover} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-xl" />}
    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/80" />
    <div className="relative flex h-full flex-col items-center justify-between p-2.5 text-center">
      <span className="h-4" />
      {cover ? <img src={cover} alt="" className="w-28 rounded-[8px] shadow-lg" /> : <span className="size-28 rounded-[8px] bg-white/10" />}
      <div className="flex w-full flex-col gap-1.5">
        <p className="m-0 flex flex-wrap justify-center gap-x-1 text-[17px] font-extrabold uppercase leading-tight text-white">
          {words.map((word, index) => <span key={index} className="lyric-word inline-block"
            style={{ '--lyric-at': `${index * WORD_STEP_S}s`, '--lyric-cycle': cycle } as CSSProperties}>{word}</span>)}
        </p>
        <p className="m-0 truncate text-[11px] text-white/70">{artist}</p>
        <span className="rounded-full bg-white py-1.5 text-[11px] font-semibold text-black">Listen now</span>
      </div>
    </div>
  </div>;
}
