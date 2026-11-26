/** What a finished video is called when saved: "mumoo" and its own short code, the same from the cart, Media or a zip. */
export const videoName = (/** @type {string} */ id) => `mumoo ${id.replace(/-/g, '').slice(0, 8)}.mp4`;
