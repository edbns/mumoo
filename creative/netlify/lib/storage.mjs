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

export async function deleteObject(key) {
  const response = await aws().fetch(objectUrl(key), { method: 'DELETE' });
  if (!response.ok) throw new Error(`Storage refused the delete (${response.status}).`);
}

/** A download link that stops working after `seconds`. */
export async function signedDownload(key, filename, seconds = 900) {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(seconds));
  // No filename means the file is shown in place (a photo preview) rather than saved.
  if (filename) url.searchParams.set('response-content-disposition', `attachment; filename="${filename}"`);
  return (await aws().sign(url, { method: 'GET', aws: { signQuery: true } })).url;
}
