import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  OffRecordClient, makeProof, captureAuthCallback,
} from '../scripts/off-record-auth.js';

function harness(overrides = {}) {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key),
    setItem: (key, value) => memory.set(key, value),
  };
  const requests = [];
  const navigations = [];
  const client = new OffRecordClient({
    origin: 'https://api.example.test',
    storage,
    fetcher: async (url, init) => {
      requests.push({ url, ...init });
      return Response.json({ ok: true });
    },
    navigate: (url) => navigations.push(url),
    location: { href: 'https://site.example.test/dashboard?unrelated=1#/admin/attendance', hash: '#/admin/attendance' },
    ...overrides,
  });
  return { client, memory, storage, requests, navigations };
}

test('versioned settings and nickname sync preserve exact unkeyed request shapes', async () => {
  const { client, requests } = harness();
  client.token = 'fixture-token';
  client.expiresAt = Date.now() + 60000;
  for (const [id, path, body, method] of [
    ['setting:attendance', '/api/settings/attendance', { version: 0, patch: { rewardXp: 750 } }, 'PUT'],
    ['jobs:sync', '/api/jobs/sync', {}, 'POST'],
  ]) {
    const record = client.prepare(id, path, body, method, { keyed: false });
    assert.deepEqual(record.body, body);
    assert.equal(client.prepare(id, path, body, method, { keyed: false }), record);
    await client.submit(id);
    assert.deepEqual(JSON.parse(requests.at(-1).body), body);
  }
});

test('PKCE uses independent random verifier and attempt with SHA256 base64url', async () => {
  const proof = await makeProof();
  assert.match(proof.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(proof.attempt, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(proof.attempt, proof.verifier);
  assert.equal(proof.challenge, createHash('sha256').update(proof.verifier).digest('base64url'));
});

test('top-level restore has an exact queryless/hashless return URL and is bounded', async () => {
  const { client, navigations } = harness();
  assert.equal(await client.startLogin(true), true);
  const url = new URL(navigations[0]);
  assert.equal(url.origin, 'https://api.example.test');
  assert.equal(url.pathname, '/auth/start');
  assert.equal(url.searchParams.get('return_to'), 'https://site.example.test/dashboard');
  assert.equal(url.searchParams.get('restore'), '1');
  assert.equal(url.searchParams.get('attempt'), client.state.auth.attempt);
  assert.equal(await client.startLogin(true), false);
  assert.equal(navigations.length, 1);
});

test('callback code is removed before exchange and access token stays in memory only', async () => {
  const h = harness();
  await h.client.startLogin();
  const savedProof = { ...h.client.state.auth };
  const calls = [];
  captureAuthCallback({ href: 'https://site.example.test/dashboard?offrecord_code=one-use&keep=1#/shop' }, {
    state: null,
    replaceState: (state, title, url) => calls.push(['replace', url]),
  });
  h.client.fetcher = async (url, init) => {
    calls.push(['fetch', url]);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(init.body), {
      code: 'one-use', verifier: savedProof.verifier, attempt: savedProof.attempt,
    });
    return Response.json({ accessToken: 'memory-only-token', expiresIn: 300 });
  };
  await h.client.initialize();
  assert.equal(calls[0][0], 'replace');
  assert.equal(calls[0][1], '/dashboard?keep=1#/shop');
  assert.equal(h.client.token, 'memory-only-token');
  assert.equal(h.client.state.auth, undefined);
  assert.equal([...h.memory.values()].join('').includes('memory-only-token'), false);
});

test('general requests omit cookies and include Bearer; expired requests never fetch', async () => {
  const h = harness();
  h.client.token = 'in-memory';
  h.client.expiresAt = Date.now() + 300000;
  await h.client.request('/api/me');
  assert.equal(h.requests[0].credentials, 'omit');
  assert.equal(h.requests[0].headers.Authorization, 'Bearer in-memory');
  h.client.expiresAt = 0;
  await assert.rejects(() => h.client.request('/api/me'), { status: 401 });
  assert.equal(h.requests.length, 1);
  await assert.rejects(() => h.client.request('//other.test/api'), { code: 'configInvalid' });
});

test('idempotency keys and complete request bodies survive login, reload and explicit retry', async () => {
  const h = harness();
  const body = { productId: '1', version: 7 };
  const original = h.client.prepare('purchase:1', '/api/purchases', body);
  h.client.draft('setting:attendance', { version: 1, value: { rewardXp: 750 } });
  await h.client.startLogin(true);
  const second = harness({ storage: h.storage });
  assert.deepEqual(second.client.state.requests['purchase:1'], original);
  assert.equal(second.client.draft('setting:attendance').value.rewardXp, 750);
  assert.deepEqual(second.client.prepare('purchase:1', '/api/purchases', body), original);
  assert.throws(() => second.client.prepare('purchase:1', '/api/purchases', { ...body, version: 8 }), { code: 'pendingConflict' });
  await assert.rejects(() => second.client.submit('purchase:1'), { status: 401 });
  assert.deepEqual(second.client.state.requests['purchase:1'], original);
  assert.equal(second.requests.length, 0);
  second.client.token = 'valid-memory-token';
  second.client.expiresAt = Date.now() + 300000;
  await second.client.submit('purchase:1');
  assert.equal(second.requests[0].body, JSON.stringify(original.body));
  assert.equal(second.client.state.requests['purchase:1'], undefined);
});

test('explicit logout suppresses automatic restoration, including failed revocation', async () => {
  const h = harness({ fetcher: async () => { throw new Error('offline'); } });
  h.client.token = 'valid';
  h.client.expiresAt = Date.now() + 300000;
  await assert.rejects(() => h.client.logout());
  assert.equal(h.client.token, '');
  assert.equal(await h.client.startLogin(true), false);
  assert.equal(h.navigations.length, 0);
  await h.client.startLogin(false);
  assert.equal(h.navigations.length, 1);
});

test('missing configuration never makes API or site-relative requests', async () => {
  const h = harness({ origin: '' });
  assert.deepEqual(await h.client.initialize(), { setup: true });
  await assert.rejects(() => h.client.request('/api/me'), { code: 'setupHelp' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.navigations.length, 0);
});

test('server errors preserve status, Korean message and Retry-After without auto retry', async () => {
  const h = harness({
    fetcher: async () => Response.json({ error: { code: 'RATE_LIMITED', message: '잠시 후 다시 시도해 주세요.' } }, {
      status: 429, headers: { 'Retry-After': '12' },
    }),
  });
  h.client.token = 'valid';
  h.client.expiresAt = Date.now() + 300000;
  await assert.rejects(() => h.client.request('/api/me'), {
    status: 429, retryAfter: '12', message: '잠시 후 다시 시도해 주세요.',
  });
});

test('unsafe storage prevents redirect and oversized requests never dispatch', async () => {
  const h = harness({ storage: { getItem: () => '', setItem: () => { throw new Error('blocked'); } } });
  await assert.rejects(() => h.client.startLogin(), { code: 'storageFailed' });
  assert.equal(h.navigations.length, 0);
  assert.throws(() => h.client.prepare('large', '/api/products', { product: { description: '가'.repeat(12000) } }), { status: 413 });
});

test('head sanitizes login landing synchronously before AEM/RUM and sets no-referrer', async () => {
  const head = await readFile(new URL('../head.html', import.meta.url), 'utf8');
  const inline = head.match(/<script nonce="aem">([\s\S]*?)<\/script>/);
  assert.ok(inline);
  assert.ok(head.indexOf(inline[0]) < head.indexOf('src="/scripts/aem.js"'));
  assert.ok(head.indexOf('name="referrer" content="no-referrer"') < head.indexOf('<script'));
  const fakeWindow = {
    location: { href: 'https://site.test/dashboard?offrecord_code=secret&offrecord_error=denied&keep=1#/me' },
    history: { state: null, replaceState: (state, title, url) => { fakeWindow.location.href = `https://site.test${url}`; } },
  };
  runInNewContext(inline[1], { window: fakeWindow, URL });
  assert.equal(fakeWindow.location.href, 'https://site.test/dashboard?keep=1#/me');
  assert.equal(fakeWindow.offRecordAuthLanding.code, 'secret');
  const h = harness();
  globalThis.window = fakeWindow;
  captureAuthCallback(fakeWindow.location, fakeWindow.history);
  assert.equal(fakeWindow.offRecordAuthLanding, undefined);
  delete globalThis.window;
  assert.deepEqual(await h.client.initialize(), { error: 'loginFailed' });
});

test('drafts and pending requests are separated when a different Discord account logs in', () => {
  const { client } = harness();
  client.bindActor('user-a');
  client.draft('gift:send', { amount: 100 });
  const original = client.prepare('gift:send', '/api/gifts', { userId: 'target', amount: 100 });
  client.bindActor('user-b');
  assert.equal(client.draft('gift:send'), undefined);
  assert.deepEqual(client.state.requests, {});
  client.bindActor('user-a');
  assert.equal(client.draft('gift:send').amount, 100);
  assert.deepEqual(client.state.requests['gift:send'], original);
});

test('preparing a mutation takes an immutable snapshot, not references to a live form model', () => {
  const { client } = harness();
  const body = { product: { title: '확인한 타이틀', priceXp: 100 }, version: 1 };
  const record = client.prepare('product:1', '/api/products/1', body, 'PUT');
  body.product.title = '나중에 수정한 타이틀';
  body.product.priceXp = 200;
  assert.equal(record.body.product.title, '확인한 타이틀');
  assert.equal(record.body.product.priceXp, 100);
});

test('simultaneous expired requests start only one browser-bound restore attempt', async () => {
  const { client, navigations } = harness();
  await Promise.all([client.startLogin(true), client.startLogin(true), client.startLogin(true)]);
  assert.equal(navigations.length, 1);
  const url = new URL(navigations[0]);
  assert.equal(url.searchParams.get('attempt'), client.state.auth.attempt);
});

test('new-product retry compares the actual JSON body, including omitted optional version', () => {
  const { client } = harness();
  const body = { product: { title: '새 상품', priceXp: 100 }, version: undefined };
  const original = client.prepare('product:new', '/api/products', body);
  assert.equal(original.body.version, undefined);
  assert.deepEqual(client.prepare('product:new', '/api/products', body), original);
});
