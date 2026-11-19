export type CreditPack = {
  usd: number;
  /** One credit makes one video. */
  videos: number;
  /** Marks the pack most people take. */
  popular?: boolean;
};

/** The only packs on sale, on the pricing page and in the Purchase Credits popup. The server's are in `netlify/lib/polar.mjs`. */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { usd: 5, videos: 20 },
  { usd: 20, videos: 100, popular: true },
  { usd: 50, videos: 300 },
];

/** What one video costs in a pack, as the person reads it: "25¢", "17¢". */
export const perVideo = (pack: CreditPack) => `${Math.round((pack.usd * 100) / pack.videos)}¢`;

export const packFor = (usd: number) => CREDIT_PACKS.find(pack => pack.usd === usd);
