/**
 * What a fan opened the page with, from the user agent: the browser (the in-app browsers of Instagram, Facebook and TikTok count as
 * their app, as that is where most fans are), the kind of device and the operating system. Robots are recognised so they are not
 * counted. Only these names are kept, never the user agent itself.
 */

const BROWSERS = [
  [/Instagram/, 'Instagram App'],
  [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook App'],
  [/musical_ly|BytedanceWebview|TikTok|trill_/i, 'TikTok App'],
  [/Barcelona/, 'Threads App'],
  [/Snapchat/, 'Snapchat App'],
  [/Twitter|TwitterAndroid/, 'X App'],
  [/Line\//, 'LINE App'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera|OPT\//, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox|FxiOS/, 'Firefox'],
  [/Chrome|CriOS|Chromium/, 'Chrome'],
  [/Safari/, 'Safari'],
];
const SYSTEMS = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch|go-http/i;

/** {browser, device, os, robot} for a user agent; unknown parts are 'Unknown'. */
export function parseAgent(agent = '') {
  const ua = String(agent).slice(0, 1000);
  if (!ua) return { browser: 'Unknown', device: 'Unknown', os: 'Unknown', robot: false };
  const tablet = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android/.test(ua);
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? 'Unknown',
    device: tablet ? 'Tablet' : mobile ? 'Mobile' : 'Desktop',
    os: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? 'Unknown',
    robot: ROBOT.test(ua),
  };
}
