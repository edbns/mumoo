/** The services a smart link has a button for, in the order they appear before the artist changes it. Shared by the server and the editor. */
export const SERVICES = ['spotify', 'apple', 'youtube', 'youtubeMusic', 'deezer', 'tidal', 'soundcloud', 'amazon'];

export const LABELS = {
  spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube', youtubeMusic: 'YouTube Music',
  deezer: 'Deezer', tidal: 'TIDAL', soundcloud: 'SoundCloud', amazon: 'Amazon Music',
};

/** Each service's logo, served from /logos/<service>.svg. */
export const logoOf = (home, service) => `${home}/logos/${service}.svg`;
