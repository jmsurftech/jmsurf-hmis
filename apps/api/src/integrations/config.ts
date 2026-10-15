/** Integration configuration from environment variables (see /.env.example). Read lazily so tests can override. */
export const env = (name: string, fallback = '') => process.env[name] ?? fallback;
export const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== '' ? v : fallback;
};
export const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
