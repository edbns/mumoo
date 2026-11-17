/**
 * A song handed from Create Smart Link to the creative generator ("Make my first ad free"): the upload step greets the artist with
 * it, and its title and artist stand in when the uploaded file has no tags. Kept in memory only, and taken once.
 */
export type HandedSong = { title: string; artist: string; cover: string | null };

let handed: HandedSong | null = null;
export function handSong(song: HandedSong) { handed = song; }
export function takeHandedSong(): HandedSong | null {
  const song = handed;
  handed = null;
  return song;
}
