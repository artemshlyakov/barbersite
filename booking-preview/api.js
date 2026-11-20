import { supabaseUrl, supabaseAnonKey } from './api-config.js';

const REQUEST_TIMEOUT = 45000;
let session = null;
let refreshing = null;
let authVersion = 0;

function failure(status, code) {
  return Object.assign(new Error(code), { status, code });
}

function publicKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const raw = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(raw)).role === 'anon';
  } catch { return false; }
}

function gateway() {
  if (!supabaseUrl || !publicKey(supabaseAnonKey)) throw failure(503, 'not_configured');
  const url = new URL(supabaseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (local && url.protocol === 'http:'))) {
    throw failure(503, 'not_configured');
  }
  return url.href.replace(/\/+$/, '');
}

const bookingConflicts = new Set(['slot unavailable', 'day conflict', 'booking unavailable', 'request key reused', 'service in use']);

function responseError(response, data, path) {
  const message = data?.message;
  if (response.status === 429 || data?.code === 'PT429' || ['phone limit','rate limit','too many requests'].includes(message))
    return failure(429, message === 'phone limit' ? message : 'too_many_requests');
  if (bookingConflicts.has(message)) return failure(409, message);
  if (['23503','23505','23P01','23514'].includes(data?.code)) return failure(409, 'conflict');
  if (path.startsWith('/auth/') && [400,401,403].includes(response.status)) return failure(401, 'unauthorized');
  if (response.status === 401 || data?.code === 'PGRST301') return failure(401, 'unauthorized');
  if (response.status === 403 || data?.code === '42501') return failure(403, 'forbidden');
  if (data?.code?.startsWith('22') || message === 'invalid_booking') return failure(400, 'invalid_booking');
  return failure(response.status, 'database_unavailable');
}

async function request(path, body, accessToken) {
  const headers = { apikey: supabaseAnonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  else if (!supabaseAnonKey.startsWith('sb_publishable_')) headers.Authorization = 'Bearer ' + supabaseAnonKey;
  const response = await fetch(gateway() + path, {
    method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (response.status === 204 && response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response, data, path);
  if (data === null && !path.startsWith('/auth/v1/logout')) throw failure(502, 'database_unavailable');
  return data;
}

function saveSession(data, version) {
  if (version !== authVersion || !data?.access_token || !data.refresh_token || !(Number(data.expires_in) > 0)) {
    throw failure(401, 'unauthorized');
  }
  // The static preview may share its origin with other repositories. Keep tokens in this tab's memory.
  session = { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + 1000 * Number(data.expires_in) };
  return session.access;
}

async function accessToken() {
  if (!session) throw failure(401, 'unauthorized');
  if (session.expires > Date.now() + 60000) return session.access;
  if (!refreshing) {
    const version = authVersion;
    refreshing = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh })
      .then(data => saveSession(data, version))
      .catch(error => {
        if (version === authVersion && error.status === 401) session = null;
        throw error;
      })
      .finally(() => { if (version === authVersion) refreshing = null; });
  }
  return refreshing;
}

async function logout() {
  const token = session?.access;
  ++authVersion;
  session = refreshing = null;
  if (token) await request('/auth/v1/logout?scope=local', {}, token);
}

export async function api(path, body) {
  const [route, query] = path.split('?');
  const payload = body ?? Object.fromEntries(new URLSearchParams(query));
  const rpc = name => '/rest/v1/rpc/habib_' + name;
  switch (route) {
    case '/services': return request(rpc('services'), {});
    case '/slots': return request(rpc('slots'), { ...payload, service: Number(payload.service) });
    case '/reserve': return request(rpc('reserve'), payload);
    case '/login': {
      const version = ++authVersion;
      session = refreshing = null;
      const data = await request('/auth/v1/token?grant_type=password', { email: body.email, password: body.password });
      saveSession(data, version);
      return;
    }
    case '/logout': return logout();
    default: {
      if (!route.startsWith('/admin/')) throw failure(404, 'not_found');
      const token = await accessToken();
      return request(rpc('admin'), { action: route.slice('/admin/'.length), payload }, token);
    }
  }
}
