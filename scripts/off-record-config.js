// Public deployment configuration only. Never put credentials in this file.
export const API_ORIGIN = '';
export const APP_PATH = '/dashboard';
export const ALLOW_LOCALHOST_API = false;

export function apiOrigin(value = API_ORIGIN, allowLocal = ALLOW_LOCALHOST_API) {
  if (!value) return '';
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:'))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('INVALID_API_ORIGIN');
  }
  return url.origin;
}
