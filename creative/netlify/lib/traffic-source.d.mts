export type Source = 'direct' | 'meta_ads' | 'meta' | 'tiktok_ads' | 'tiktok' | 'google_ads' | 'youtube' | 'other';
export const SOURCES: Source[];
export const SOURCE_LABELS: Record<Source, string>;
export function sourceOf(pageUrl: string): Source;
