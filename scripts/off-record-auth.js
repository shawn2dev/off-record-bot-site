import { apiOrigin, APP_PATH } from './off-record-config.js';
import { canonical, requestSize } from './off-record-core.js';
import ApiError from './off-record-error.js';

const STORAGE_KEY = 'offrecord.transient.v1';
let callback;

export function captureAuthCallback(location = window.location, history = window.history) {
  if (typeof window !== 'undefined' && window.offRecordAuthLanding) {
    callback = window.offRecordAuthLanding;
    delete window.offRecordAuthLanding;
    return;
  }
  const url = new URL(location.href);
  if (!url.searchParams.has('offrecord_code') && !url.searchParams.has('offrecord_error')) return;
  callback = {
    code: url.searchParams.get('offrecord_code'),
    error: url.searchParams.get('offrecord_error'),
  };
  url.searchParams.delete('offrecord_code');
  url.searchParams.delete('offrecord_error');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomKey() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function makeProof() {
  const verifier = randomKey();
  const attempt = randomKey();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, attempt, challenge: base64url(new Uint8Array(digest)) };
}

export class OffRecordClient {
  constructor({
    origin, storage, fetcher, navigate, location,
  } = {}) {
    this.origin = apiOrigin(origin);
    this.storage = storage || window.sessionStorage;
    this.fetcher = fetcher || window.fetch.bind(window);
    this.navigate = navigate || ((url) => window.location.assign(url));
    this.location = location || window.location;
    this.token = '';
    this.expiresAt = 0;
    this.state = { drafts: {}, requests: {} };
    try {
      const saved = JSON.parse(this.storage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') {
        this.state = { ...this.state, ...saved };
        this.state.drafts ||= {};
        this.state.requests ||= {};
      }
    } catch { /* Corrupt or unavailable storage must not break the login screen. */ }
  }

  persist() {
    // Tokens are deliberately separate from this serializable state.
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      throw new ApiError('storageFailed');
    }
  }

  draft(id, value) {
    if (value === undefined) return this.state.drafts[id];
    this.state.drafts[id] = value;
    this.persist();
    return value;
  }

  clearDraft(id) {
    delete this.state.drafts[id];
    this.persist();
  }

  bindActor(userId) {
    if (this.state.actorId === userId) return false;
    this.state.accounts ||= {};
    if (this.state.actorId) {
      this.state.accounts[this.state.actorId] = {
        drafts: this.state.drafts, requests: this.state.requests,
      };
    }
    const restored = this.state.accounts[userId] || { drafts: {}, requests: {} };
    this.state.drafts = restored.drafts;
    this.state.requests = restored.requests;
    delete this.state.accounts[userId];
    this.state.actorId = userId;
    this.persist();
    return true;
  }

  async startLogin(restore = false) {
    if (this.loginStarting) return true;
    this.loginStarting = true;
    try { return await this.beginLogin(restore); } finally { this.loginStarting = false; }
  }

  async beginLogin(restore) {
    if (!this.origin) throw new ApiError('setupHelp');
    const now = Date.now();
    if (restore && (this.state.suppressRestore || now - (this.state.lastRestore || 0) < 30000)) {
      return false;
    }
    const proof = await makeProof();
    const returnUrl = new URL(this.location.href);
    if (APP_PATH && returnUrl.pathname !== APP_PATH) throw new ApiError('configInvalid');
    returnUrl.search = '';
    returnUrl.hash = '';
    this.state.auth = { verifier: proof.verifier, attempt: proof.attempt, at: now };
    this.state.returnHash = this.location.hash;
    if (restore) this.state.lastRestore = now;
    else {
      this.state.suppressRestore = false;
      this.state.lastRestore = 0;
    }
    this.persist();
    const url = new URL('/auth/start', this.origin);
    url.searchParams.set('return_to', returnUrl.href);
    url.searchParams.set('challenge', proof.challenge);
    url.searchParams.set('attempt', proof.attempt);
    if (restore) url.searchParams.set('restore', '1');
    this.navigate(url.href);
    return true;
  }

  async initialize() {
    const returned = callback;
    callback = undefined;
    if (!this.origin) return { setup: true };
    if (returned) {
      if (returned.error) {
        delete this.state.auth;
        this.state.suppressRestore = true;
        this.persist();
        return { error: returned.error === 'session_expired' ? 'sessionExpired' : 'loginFailed' };
      }
      const proof = this.state.auth;
      delete this.state.auth;
      this.persist();
      if (!proof || Date.now() - proof.at > 10 * 60000) {
        this.state.suppressRestore = true;
        this.persist();
        return { error: 'loginFailed' };
      }
      try {
        const response = await this.request('/auth/exchange', {
          method: 'POST',
          body: { code: returned.code, verifier: proof.verifier, attempt: proof.attempt },
          anonymous: true,
        });
        if (typeof response.accessToken !== 'string' || !Number.isFinite(response.expiresIn)
          || response.expiresIn <= 0) throw new ApiError('loginFailed');
        this.token = response.accessToken;
        this.expiresAt = Date.now() + response.expiresIn * 1000;
        return { hash: this.state.returnHash };
      } catch {
        this.state.suppressRestore = true;
        this.persist();
        return { error: 'loginFailed' };
      }
    }
    return { redirecting: await this.startLogin(true) };
  }

  async request(path, { method = 'GET', body, anonymous = false } = {}) {
    if (!this.origin) throw new ApiError('setupHelp');
    if (!path.startsWith('/') || path.startsWith('//')) throw new ApiError('configInvalid');
    if (body && requestSize(body) > 32768) throw new ApiError('tooLarge', '', 413);
    if (!anonymous && (!this.token || Date.now() >= this.expiresAt)) {
      this.token = '';
      throw new ApiError('sessionExpired', '', 401);
    }
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!anonymous) headers.Authorization = `Bearer ${this.token}`;
    let response;
    let data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      response = await this.fetcher(`${this.origin}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      data = response.status === 204 ? {} : await response.json().catch(() => {
        if (response.ok) throw new ApiError('error');
        return {};
      });
    } catch {
      throw new ApiError('error');
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      if (response.status === 401) this.token = '';
      throw new ApiError(data.error?.code || 'error', data.error?.message, response.status, response.headers.get('Retry-After'));
    }
    return data;
  }

  prepare(id, path, body, method = 'POST', { keyed = true } = {}) {
    const snapshot = JSON.parse(JSON.stringify(body));
    const existing = this.state.requests[id];
    if (existing) {
      const { key, ...original } = existing.body;
      if (existing.path !== path || existing.method !== method
        || canonical(original) !== canonical(snapshot)) throw new ApiError('pendingConflict');
      return existing;
    }
    const record = {
      path,
      method,
      body: keyed ? { ...snapshot, key: randomKey() } : snapshot,
      at: Date.now(),
    };
    if (requestSize(record.body) > 32768) throw new ApiError('tooLarge', '', 413);
    this.state.requests[id] = record;
    this.persist();
    return record;
  }

  async submit(id) {
    const record = this.state.requests[id];
    if (!record) throw new ApiError('error');
    const result = await this.request(record.path, record);
    delete this.state.requests[id];
    this.persist();
    return result;
  }

  forget(id) {
    delete this.state.requests[id];
    this.persist();
  }

  async logout() {
    // Suppress restoration even when the network fails; a failed revocation is still reported.
    this.state.suppressRestore = true;
    delete this.state.auth;
    this.state.lastRestore = Date.now();
    let persistenceError;
    try { this.persist(); } catch (error) { persistenceError = error; }
    try {
      await this.request('/auth/logout', { method: 'POST', body: {} });
      if (persistenceError) throw persistenceError;
    } finally {
      this.token = '';
      this.expiresAt = 0;
    }
  }
}
