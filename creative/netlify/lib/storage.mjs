import { AwsClient } from 'aws4fetch';

/** Private Cloudflare R2 bucket over its S3 API. Nothing is public: people only ever get short-lived signed links. */
let client;
const aws = () => (client ??= new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
}));
const objectUrl = (key) => `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}`;

export const storageReady = () => Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

export async function putObject(key, body, contentType) {
  const response = await aws().fetch(objectUrl(key), { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  if (!response.ok) throw new Error(`Storage refused the upload (${response.status}).`);
}

export async function getObject(key) {
  const response = await aws().fetch(objectUrl(key));
  if (!response.ok) throw new Error(`Storage could not read the file (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The object's size in bytes, or null when it does not exist. */
export async function objectSize(key) {
  const response = await aws().fetch(objectUrl(key), { method: 'HEAD' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage could not check the file (${response.status}).`);
  return Number(response.headers.get('content-length'));
}

export async function deleteObject(key) {
  const response = await aws().fetch(objectUrl(key), { method: 'DELETE' });
  if (!response.ok) throw new Error(`Storage refused the delete (${response.status}).`);
}

/** Every key that starts with `prefix` (S3 ListObjectsV2, page by page). */
export async function listKeys(prefix) {
  const keys = [];
  let token = null;
  do {
    const url = new URL(`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (token) url.searchParams.set('continuation-token', token);
    const response = await aws().fetch(url);
    if (!response.ok) throw new Error(`Storage could not list the files (${response.status}).`);
    const xml = await response.text();
    for (const [, key] of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(key.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null : null;
  } while (token);
  return keys;
}

/** A download link that stops working after `seconds`. */
export async function signedDownload(key, filename, seconds = 900) {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(seconds));
  // No filename means the file is shown in place (a photo preview) rather than saved.
  if (filename) url.searchParams.set('response-content-disposition', `attachment; filename="${filename}"`);
  return (await aws().sign(url, { method: 'GET', aws: { signQuery: true } })).url;
}

/** A link that lets one file be uploaded straight to storage (the browser or the worker PUTs to it), for `seconds`. */
export async function signedUpload(key, seconds = 1800) {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(seconds));
  return (await aws().sign(url, { method: 'PUT', aws: { signQuery: true } })).url;
}
