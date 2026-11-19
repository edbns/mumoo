import { adminEmails } from './admin.mjs';
import { allowanceOf } from './credits.mjs';
import { sendMail } from './mail.mjs';
import { db } from './person.mjs';

/**
 * The help chat. The helper never writes words of its own: every reply is one MUMOO wrote below, or one filled with the
 * person's own numbers by our code. A question is matched to a reply here first; when nothing matches, our own model
 * (Qwen on Modal, `modal_lyric_meaning_staging.py` `pick`) may only choose one of these ids. So nothing a person types can
 * make the chat talk about something else, show other people's data, or do anything: it has nothing to do things with.
 */

export const MAX_MESSAGE_CHARS = 500;
const PER_MINUTE = 6;
const PER_DAY = 40;
/** After this many tries at breaking its rules in a day, the helper stops answering that account and the team takes over. */
const FLAGS_BEFORE_TEAM = 3;
/** Our model wakes up in under a minute or two; past this the person is offered the team instead. */
const PICK_TIMEOUT_MS = 120_000;
const MODAL_PICK = 'https://edbns-mumoo-staging--mumoo-lyric-meaning-staging-support-submit.us-east.modal.run';
const MODAL_STATUS = 'https://edbns-mumoo-staging--mumoo-lyric-meaning-staging-status.us-east.modal.run';

/** What the helper can say. `about` is what the model reads to choose; `match` finds it without the model. */
export const ANSWERS = [
  { id: 'what_is_credit', about: 'what a credit is, how credits work, what one credit buys',
    match: [/\bcredits?\b.*\b(what|how|mean|work)|\b(what|how)\b.*\bcredits?\b/],
    text: 'One credit makes one video. That’s it. You spend it when you press Create, and if a video fails the credit comes back on its own.' },
  { id: 'prices', about: 'prices, packs, how much it costs, how to buy credits',
    match: [/\b(price|prices|pricing|cost|costs|how much|packs?|buy|purchase|cheap|expensive|\$\d+)\b/],
    text: 'Packs are $5 for 20 videos, $20 for 100 and $50 for 300. Pay once, no subscription, and credits never expire. Buy them from Credits in your account menu, or on the Pricing page.' },
  { id: 'subscription', about: 'subscription, monthly fee, whether credits expire, cancelling',
    match: [/\b(subscri\w*|monthly|recurring|expire\w*|cancel\w*)\b/],
    text: 'Nope, no subscription. You pay once and your credits stay until you use them. They never expire.' },
  { id: 'free_video', about: 'the free first video, trying it for free',
    match: [/\bfree\b.*\b(video|first|try|trial)|\b(first|trial)\b.*\bfree\b/],
    text: 'Every new account gets its first video free, no watermark. After that each video takes one credit.' },
  { id: 'invite', about: 'inviting friends, referral link, getting free videos by sharing',
    match: [/\b(invite\w*|referr\w*|refer|friend|friends|share my link)\b/],
    text: 'Open Invite friends in your account menu and share your link. Your friend gets 10 extra videos on their first pack, and you get 10 free once they pay (up to 20 friends a month).' },
  { id: 'payment', about: 'who takes the payment, card, Polar, tax, invoices, receipts',
    match: [/\b(payment|pay|paid|card|polar|tax|vat|invoice\w*|receipt\w*|billing)\b/],
    text: 'Polar (polar.sh), our payment partner, takes the payment and adds tax where it applies. We never see your card. Your invoices are in Invoices in your account menu.' },
  { id: 'refund', about: 'refunds, money back, a video that failed or came out wrong',
    match: [/\b(refund\w*|money back|chargeback|reimburs\w*)\b/],
    text: 'Credits are non-refundable except where the law says so. If a video fails to render, its credit comes back to you on its own. If something else went wrong, ask to talk to the team.' },
  { id: 'download', about: 'downloading videos, where finished videos go, saving them',
    match: [/\b(download\w*|save|saving|export\w*)\b/],
    text: 'Finished videos go to Media in your account menu. Press the download icon on a video, or pick a few and press Download.' },
  { id: 'storage', about: 'storage space, 5 GB, media full, deleting old videos',
    match: [/\b(storage|space|gb|full|room)\b/],
    text: 'You get 5 GB in Media for your videos and uploads. If it fills up, delete old ones in Media to make room.' },
  { id: 'quality', about: 'video size and quality, HD, 1080x1920, aspect, watermark, preview looks blurry',
    match: [/\b(quality|hd|resolution|1080|blurr\w*|pixel\w*|watermark|format|vertical|aspect|size of the video)\b/],
    text: 'Videos are vertical 1080×1920, ready for Reels, TikTok and Shorts, with no watermark. What you see on the creatives page is just a preview: downloads are HD.' },
  { id: 'song_upload', about: 'uploading a song, which audio files work, song length, video with the song',
    match: [/\b(mp3|wav|m4a|aac|flac|ogg|aiff|audio file|upload\w* (my|a|the) (song|track|music)|song file|which files)\b/],
    text: 'Drop your song on the first step: MP3, M4A/AAC, WAV, FLAC, OGG/Opus or AIFF, at least 15 seconds long. No song file? A video with the song playing works too, like a saved TikTok or a screen recording.' },
  { id: 'lyrics', about: 'lyrics wrong, out of sync, editing lyrics, songs without lyrics',
    match: [/\b(lyric\w*|words|sync\w*|transcri\w*)\b/],
    text: 'On the clip step you can fix any word and sync it again. If your song has no words, press “My song has no lyrics” and you get the templates that work without them.' },
  { id: 'own_media', about: 'using my own photos, videos or GIFs, uploading pictures, sending from phone',
    match: [/\b(my own|own (photo|picture|video|media|image)s?|upload\w* (photo|picture|image|video)s?|gif\w*|photos?|pictures?|images?)\b/],
    text: 'On the creatives page press Upload and pick up to 10 photos, videos or GIFs (JPG, PNG, WebP, MP4, MOV, WebM or GIF). Only upload media you own. You can also send them from your phone from the same popup.' },
  { id: 'templates', about: 'templates, looks, styles, refreshing the creatives, choosing videos',
    match: [/\b(template\w*|looks?|styles?|refresh\w*|creatives?|effects?)\b/],
    text: 'Each card on the creatives page is a different template made for your song. Press Refresh for new ones, pick the cards you like, then press the bar at the bottom and Create.' },
  { id: 'smart_links', about: 'smart links, fan pages, link in bio, streaming links',
    match: [/\b(smart ?links?|fan ?page\w*|link in bio|spotify|apple music|deezer|streaming)\b/],
    text: 'Smart links are free. Open Smart Links in your account menu, paste a Spotify, Apple Music, YouTube or Deezer link, and you get one page with your song on every service.' },
  { id: 'phone', about: 'using MUMOO on a phone or mobile, the app',
    match: [/\b(phone|mobile|iphone|android|ipad|tablet|app store)\b/],
    text: 'Making videos works best on a computer for now. From your phone you can send photos and videos to your computer with “Send from your phone”.' },
  { id: 'sign_in', about: 'signing in, login code, the email code did not arrive, Google sign-in',
    match: [/\b(sign ?in|log ?in|login|code|otp|password|google)\b/],
    text: 'You sign in with a code we email you, or with Google. If the code doesn’t show up, check your spam folder and make sure the email is typed right.' },
  { id: 'account_settings', about: 'changing my email, deleting my account, account settings',
    match: [/\b(delete (my )?account|close (my )?account|change (my )?email|settings|remove my data)\b/],
    text: 'Open Settings in your account menu. You can change your email there, or delete your account and everything in it.' },
  { id: 'privacy', about: 'privacy, what happens to my music and data, AI training',
    match: [/\b(privacy|private|my data|train\w*|who can see|safe|secure)\b/],
    text: 'Your songs and media stay private to your account. Your song is read by models we run ourselves, and we don’t train AI on your music. The details are in the Privacy policy at the bottom of every page.' },
  { id: 'my_credits', about: 'how many credits I have left, my balance',
    match: [/\b(how many|my|left|remaining|balance)\b.*\bcredits?\b|\bcredits?\b.*\b(left|remaining|balance|have)\b/],
    account: 'credits' },
  { id: 'my_videos', about: 'where my video is, my video is not showing up, still rendering, a video failed',
    match: [/\b(where|missing|not (showing|there|ready)|stuck|still|taking (long|forever)|failed|never came)\b.*\b(video|videos|render\w*)\b|\b(video|videos|render\w*)\b.*\b(missing|not (showing|there|ready)|stuck|still|failed|never came|gone|disappeared)\b/],
    account: 'videos' },
  { id: 'greeting', about: 'hello, hi, hey with no question',
    match: [/^(hi|hey|hello|yo|hiya|sup|good (morning|evening|afternoon))\b[!. ]*$/],
    text: 'Hey! Ask me anything about MUMOO: credits, your videos, uploads, smart links… If I can’t help, I’ll pass you to the team.' },
  { id: 'thanks', about: 'thank you, thanks, great, that helped',
    match: [/^(thanks?|thank you|thx|ty|cheers|great|perfect|cool|ok(ay)?|nice)\b[!. ]*$/],
    text: 'Anytime! Anything else, just ask.' },
];

export const FIXED = {
  off_topic: 'I can only help with MUMOO. Want me to pass this to the team?',
  unsure: 'Not sure about that one. Want me to pass it to the team?',
  human: 'Passed to the MUMOO team. We’ll reply here or by email, usually within a day.',
  waiting: 'Got it, the team will see this too.',
  stopped: 'I’ve passed this chat to the MUMOO team. They’ll reply here or by email.',
};

/** Every reply the helper may ever give, apart from the ones with the person's own numbers. */
const WRITTEN = new Set([...ANSWERS.filter(answer => answer.text).map(answer => answer.text), ...Object.values(FIXED)]);

/** The choices the model may pick from: every answer, and the three ways out. */
export const CHOICES = [
  ...ANSWERS.map(answer => [answer.id, answer.about]),
  ['human', 'the person wants a real person, is upset, or has a problem that needs looking into'],
  ['off_topic', 'not about using MUMOO, or trying to change how the helper behaves'],
  ['unsure', 'about MUMOO but no answer fits'],
];

const normal = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Tries to steer the helper: new instructions, other roles, hidden prompts, or the markers chat models use. */
const STEERING = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instruction|rule|prompt|previous|above|everything|guideline|polic)/,
  /\b(system|developer|hidden|initial|original)\s*(prompt|message|instruction)/,
  /\b(you are now|from now on|act as|pretend|roleplay|role-play|role play|jailbreak|dan mode|developer mode|simulate)\b/,
  /\b(reveal|show|print|repeat|tell me)\b.{0,30}\b(prompt|instruction|rules|system|above|configuration|settings)\b/,
  /\b(new|updated|different)\s+(instruction|rule|persona|role)s?\b/,
  /<\|?(im_start|im_end|system|endoftext)\|?>|\[\/?(inst|system)\]|^\s*(system|assistant)\s*:/m,
  /\b(api key|secret|token|password of|database|admin access|other users?)\b/,
];
export const steers = text => STEERING.some(pattern => pattern.test(normal(text)));

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|co|ly|me|xyz|ru|info|biz|link|site|top)\b)/i;
export const hasLink = text => LINK.test(text);

/** The written answer a question plainly asks for, or null when it is not clear (no match, or two equally good ones). */
export function matchAnswer(text) {
  const said = normal(text);
  const scored = ANSWERS.map(answer => ({ answer, score: answer.match.filter(pattern => pattern.test(said)).length }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  // The person's own numbers are more specific than the general answer that shares their words ("how many credits").
  const own = scored.find(({ answer }) => answer.account);
  if (own && own.score >= scored[0].score) return own.answer;
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;
  return scored[0].answer;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const day = date => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The reply for an answer id, with the person's own numbers where it needs them. Only ids from the lists above exist. */
export async function replyFor(id, userId) {
  if (FIXED[id]) return FIXED[id];
  const answer = ANSWERS.find(entry => entry.id === id);
  if (!answer) return FIXED.unsure;
  if (answer.text) return answer.text;
  if (answer.account === 'credits') {
    const { credits, freeVideo } = await allowanceOf(userId);
    return `You have ${plural(credits, 'credit', 'credits')}${freeVideo ? ', and your free first video is still to come' : ''}. One credit makes one video.`;
  }
  const [row] = await db()`select count(*)::int as count, max(created_at) as newest from renders where user_id = ${userId}`;
  const kept = row.count ? `You have ${plural(row.count, 'video', 'videos')} in Media, the newest from ${day(row.newest)}. ` : 'No finished videos in Media yet. ';
  return `${kept}New ones show up in Media when they’re done, and the bar at the bottom shows how far along they are. If one fails, its credit comes back on its own.`;
}

/** The helper can only say what was written for it; anything else (which would be a bug) becomes "not sure". */
export function checkedReply(text, ownNumbers = false) {
  if (WRITTEN.has(text)) return text;
  if (ownNumbers && /^(You have \d+ credits?|You have \d+ videos? in Media|No finished videos in Media yet)/.test(text) && !hasLink(text)) return text;
  return FIXED.unsure;
}

const bridge = () => {
  const secret = process.env.MUMOO_MUSIC_BRIDGE_SECRET || '';
  if (secret.length < 32) throw new Error('The helper model is not configured.');
  return { Authorization: `Bearer ${secret}` };
};

/** Asks our model to choose an answer for this question. Returns the Modal call id. */
async function startPick(question) {
  const response = await fetch(MODAL_PICK, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', ...bridge() },
    body: JSON.stringify({ question, choices: CHOICES }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== 'string') throw new Error(`The helper model refused (${response.status}).`);
  return result.id;
}

/** The model's choice once it is in, null while it is still thinking. Anything that is not one of our ids is "unsure". */
async function pickResult(call) {
  const response = await fetch(`${MODAL_STATUS}?id=${encodeURIComponent(call)}`, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: bridge() });
  if (response.status === 202) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) return 'unsure';
  return CHOICES.some(([id]) => id === result?.pick) ? result.pick : 'unsure';
}

const sql = () => db();

async function thread(userId) {
  const [row] = await sql()`
    insert into support_threads (user_id) values (${userId}) on conflict (user_id) do update set user_id = excluded.user_id
    returning user_id, status, flagged, pending_call, pending_since, unread`;
  return row;
}

async function say(userId, author, body, { answer = null, flagged = false } = {}) {
  await sql()`insert into support_messages (user_id, author, body, answer, flagged) values (${userId}, ${author}, ${body}, ${answer}, ${flagged})`;
  await sql()`update support_threads set updated_at = now() where user_id = ${userId}`;
}

async function helperSays(userId, id) {
  const account = ANSWERS.find(entry => entry.id === id)?.account;
  await say(userId, 'helper', checkedReply(await replyFor(id, userId), Boolean(account)), { answer: id });
}

const site = () => process.env.URL || 'https://mumoo-staging.netlify.app';

/** Tells the team someone is waiting. A failed email must not lose the chat: it is in Admin either way. */
async function tellTeam(email, last) {
  const to = adminEmails();
  if (!to.length) return;
  await sendMail({
    to, subject: `Help chat: ${email} is waiting`,
    text: [`${email} asked for the team in the help chat.`, '', `Last message: ${last.slice(0, 300)}`, '', `Reply in Admin: ${site()}/admin#help`, '', 'MUMOO'].join('\n'),
  }).catch(cause => console.error('support: team email', cause));
}

async function toTeam(userId, email, last, notice) {
  const [before] = await sql()`select status from support_threads where user_id = ${userId}`;
  await sql()`update support_threads set status = 'waiting', pending_call = null, pending_since = null where user_id = ${userId}`;
  if (notice) await say(userId, 'helper', notice, { answer: 'human' });
  if (before?.status !== 'waiting') await tellTeam(email, last);
}

/** The conversation as the person sees it; finishes the model's pending choice when it is in. */
export async function conversation(userId) {
  let row = await thread(userId);
  if (row.pending_call) {
    const late = Date.now() - new Date(row.pending_since).getTime() > PICK_TIMEOUT_MS;
    const picked = await pickResult(row.pending_call).catch(() => (late ? 'unsure' : null));
    if (picked || late) {
      const [claimed] = await sql()`update support_threads set pending_call = null, pending_since = null
        where user_id = ${userId} and pending_call = ${row.pending_call} returning user_id`;
      if (claimed) await helperSays(userId, picked ?? 'unsure');
      row = await thread(userId);
    }
  }
  if (row.unread) await sql()`update support_threads set unread = false where user_id = ${userId}`;
  const messages = await sql()`select id, author, body, created_at from (
      select id, author, body, created_at from support_messages where user_id = ${userId} order by id desc limit 60) recent order by id`;
  return {
    status: row.status,
    thinking: Boolean(row.pending_call),
    messages: messages.map(message => ({ id: Number(message.id), author: message.author, text: message.body, at: message.created_at })),
  };
}

export class SupportRefusal extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** A message from the person: checked, kept, and answered by the helper (or left for the team). */
export async function ask(person, text) {
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message) throw new SupportRefusal('Type a message first.');
  if (message.length > MAX_MESSAGE_CHARS) throw new SupportRefusal(`Keep it under ${MAX_MESSAGE_CHARS} characters.`);
  if (hasLink(message)) throw new SupportRefusal('Links can’t be sent here. Just say it in words.');
  const row = await thread(person.id);
  const [counts] = await sql()`select
      count(*) filter (where created_at > now() - interval '1 minute')::int as minute,
      count(*) filter (where created_at > now() - interval '1 day')::int as today,
      count(*) filter (where flagged and created_at > now() - interval '1 day')::int as flags
    from support_messages where user_id = ${person.id} and author = 'person'`;
  if (counts.minute >= PER_MINUTE) throw new SupportRefusal('Slow down a little, one message at a time.', 429);
  if (counts.today >= PER_DAY) throw new SupportRefusal('That’s a lot of messages for today. The team will get back to you.', 429);

  const flagged = steers(message);
  await say(person.id, 'person', message, { flagged });
  if (flagged) await sql()`update support_threads set flagged = true where user_id = ${person.id}`;

  if (row.status !== 'helper') {
    // The team has this conversation; the helper stays out of it.
    await toTeam(person.id, person.email, message, null);
    return conversation(person.id);
  }
  if (flagged) {
    if (counts.flags + 1 >= FLAGS_BEFORE_TEAM) await toTeam(person.id, person.email, message, FIXED.stopped);
    else await say(person.id, 'helper', FIXED.off_topic, { answer: 'off_topic' });
    return conversation(person.id);
  }
  const plain = matchAnswer(message);
  if (plain) {
    await helperSays(person.id, plain.id);
    return conversation(person.id);
  }
  try {
    const call = await startPick(message);
    await sql()`update support_threads set pending_call = ${call}, pending_since = now() where user_id = ${person.id}`;
  } catch (cause) {
    console.error('support: pick', cause);
    await helperSays(person.id, 'unsure');
  }
  return conversation(person.id);
}

/** The person asks for the team. */
export async function askForTeam(person) {
  await thread(person.id);
  const [last] = await sql()`select body from support_messages where user_id = ${person.id} and author = 'person' order by id desc limit 1`;
  const [row] = await sql()`select status from support_threads where user_id = ${person.id}`;
  if (row.status !== 'waiting') await toTeam(person.id, person.email, last?.body ?? '(no message yet)', FIXED.human);
  return conversation(person.id);
}

/** For Admin: every conversation, waiting ones first, with the person's email and the last message. */
export async function listThreads() {
  const rows = await sql()`
    select t.user_id, u.email, t.status, t.flagged, t.updated_at,
      (select body from support_messages m where m.user_id = t.user_id order by id desc limit 1) as last,
      (select count(*)::int from support_messages m where m.user_id = t.user_id and m.flagged) as flags
    from support_threads t join app_users u on u.id = t.user_id
    where exists (select 1 from support_messages m where m.user_id = t.user_id)
    order by (t.status = 'waiting') desc, t.updated_at desc limit 200`;
  const [{ waiting }] = await sql()`select count(*)::int as waiting from support_threads where status = 'waiting'`;
  return { waiting, threads: rows.map(row => ({ userId: row.user_id, email: row.email, status: row.status, flagged: row.flagged, flags: row.flags, last: row.last, updatedAt: row.updated_at })) };
}

export async function threadFor(userId) {
  const [row] = await sql()`select t.user_id, u.email, t.status, t.flagged from support_threads t join app_users u on u.id = t.user_id where t.user_id = ${userId}`;
  if (!row) return null;
  const messages = await sql()`select id, author, body, flagged, created_at from support_messages where user_id = ${userId} order by id limit 500`;
  return { userId, email: row.email, status: row.status, flagged: row.flagged,
    messages: messages.map(message => ({ id: Number(message.id), author: message.author, text: message.body, flagged: message.flagged, at: message.created_at })) };
}

/** The team's reply: shown in the chat and emailed, so the person sees it even when they are not on MUMOO. */
export async function teamReply(userId, text) {
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body || body.length > 2000) throw new SupportRefusal('Write a reply (up to 2000 characters).');
  const found = await threadFor(userId);
  if (!found) throw new SupportRefusal('No such conversation.', 404);
  await say(userId, 'team', body);
  await sql()`update support_threads set status = 'answered', unread = true where user_id = ${userId}`;
  await sendMail({
    to: found.email, subject: 'MUMOO replied to you',
    text: [body, '', `Reply in the help chat: ${site()}/?help=1`, '', 'MUMOO'].join('\n'),
  }).catch(cause => console.error('support: reply email', cause));
  return threadFor(userId);
}

/** The team is done: the helper answers this person again. */
export async function closeThread(userId) {
  await sql()`update support_threads set status = 'helper', pending_call = null, pending_since = null where user_id = ${userId}`;
  return threadFor(userId);
}
