import { createHash, randomBytes } from 'crypto';

/** Machine API keys (analyser devices, finance partners): only the sha256 hash is stored. */
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const newApiKey = (prefix: string) => {
  const key = `${prefix}_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashApiKey(key), keyPrefix: key.slice(0, prefix.length + 7) };
};
