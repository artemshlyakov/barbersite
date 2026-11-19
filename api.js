import { bookingOrigin } from './api-config.js';

const origin = bookingOrigin || location.origin;
const onApiHost = origin === location.origin;

export async function api(path, body) {
  const response = await fetch(origin + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: onApiHost ? 'same-origin' : 'omit',
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'Request failed');
    error.status = response.status;
    error.code = data?.code || data?.error;
    throw error;
  }
  return data;
}
