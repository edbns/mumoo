/** The services a smart link has a button for, in the order they appear before the artist changes it. Shared by the server and the editor. */
export const SERVICES = ['spotify', 'apple', 'youtube', 'youtubeMusic', 'deezer', 'tidal', 'soundcloud', 'amazon'];

export const LABELS = {
  spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube', youtubeMusic: 'YouTube Music',
  deezer: 'Deezer', tidal: 'TIDAL', soundcloud: 'SoundCloud', amazon: 'Amazon Music',
};

/** Each service's logo, served from /logos/<service>.svg. */
export const logoOf = (home, service) => `${home}/logos/${service}.svg`;

/** A preview kept as Deezer's track (`deezer:<id>`): its own link expires in minutes, so the fan page asks for a fresh one each time. */
export const DEEZER_PREVIEW = /^deezer:\d{1,15}$/;
/** Where the fan page plays a preview from. */
export const previewSrc = (preview, home) => DEEZER_PREVIEW.test(preview) ? `${home}/api/links/preview?deezer=${preview.slice('deezer:'.length)}` : preview;
