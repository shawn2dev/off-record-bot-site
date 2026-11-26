import test from 'node:test';
import assert from 'node:assert/strict';
import { apiOrigin } from '../scripts/off-record-config.js';
import {
  can, routeFor, validateProduct, productState, shortDescription,
  basicOutcomes, gamePreview, validateGame, canonical, requestSize,
  adminRolesFromPermissions, memberDisplayName, memberPresentation,
} from '../scripts/off-record-core.js';
import { Dashboard, levelForXp } from '../scripts/off-record-dashboard.js';

test('member names and nested display-only details never replace IDs in actual request bodies', () => {
  const id = '123456789012345678';
  const actor = '234567890123456789';
  const raw = { userId: id, roleId: actor, reason: id, key: 'unchanged-key', winners: [{ userId: id, displayName: '<b>서버 별명</b>' }] };
  const snapshot = canonical(raw);
  const names = { [id]: '서버 별명', [actor]: '서버 운영자' };
  assert.equal(memberDisplayName(raw, 'userId', names), '서버 별명');
  assert.equal(memberDisplayName({ actorId: actor }, 'actorId', names), '서버 운영자');
  assert.equal(memberDisplayName({ userId: 'unknown' }), '탈퇴한 사용자');
  assert.equal(memberDisplayName({ userId: id, displayName: '새 별명' }, 'userId', names), '새 별명');
  const displayed = memberPresentation(raw, names);
  assert.equal(displayed.userId, '서버 별명');
  assert.equal(displayed.winners[0].userId, '<b>서버 별명</b>');
  assert.equal(displayed.roleId, actor);
  assert.equal(displayed.reason, id);
  assert.equal(displayed.key, 'unchanged-key');
  assert.equal(canonical(raw), snapshot);
});

test('member name lookup deduplicates targets without adding names to mutation bodies', async () => {
  const id = '123456789012345678';
  const calls = [];
  const app = {
    memberNames: {},
    client: { request: async (path) => {
      calls.push(path);
      return { items: [{ userId: id, displayName: '서버 별명' }] };
    } },
  };
  await Dashboard.prototype.loadMemberNames.call(app, [id, id]);
  assert.deepEqual(calls, [`/api/members?ids=${id}`]);
  assert.deepEqual(app.memberNames, { [id]: '서버 별명' });
});

test('nickname settings start settings, roles and job requests concurrently', async () => {
  const started = [];
  let rejectSettings;
  const app = {
    me: { owner: true },
    client: {
      request: () => {
        started.push('settings');
        return new Promise((resolve, reject) => { rejectSettings = reject; });
      },
    },
    getRoles: () => {
      started.push('roles');
      return new Promise(() => {});
    },
    jobPanel: () => {
      started.push('jobs');
      return new Promise(() => {});
    },
  };
  const loading = Dashboard.prototype.settingsPage.call(app, 'nickname');
  assert.deepEqual(started, ['settings', 'roles', 'jobs']);
  const failure = new Error('expected metadata failure');
  rejectSettings(failure);
  await assert.rejects(loading, failure);
});

test('simple settings do not start unrelated roles or job requests', async () => {
  const started = [];
  const failure = new Error('expected metadata failure');
  const loading = Dashboard.prototype.settingsPage.call({
    me: { owner: true },
    client: {
      request: () => {
        started.push('settings');
        return Promise.reject(failure);
      },
    },
    getRoles: () => { started.push('roles'); },
    jobPanel: () => { started.push('jobs'); },
  }, 'attendance');
  assert.deepEqual(started, ['settings']);
  await assert.rejects(loading, failure);
});

test('configuration uses the production gateway, supports explicit disabling and rejects unsafe origins', () => {
  assert.equal(apiOrigin(), 'https://off-record-xp-api.cbycdy2.workers.dev');
  assert.equal(apiOrigin(''), '');
  assert.equal(apiOrigin('https://api.example.test'), 'https://api.example.test');
  for (const value of ['http://api.example.test', 'https://user:pass@api.example.test', 'https://api.example.test/a', 'https://api.example.test/?a=1', 'https://api.example.test/#x']) {
    assert.throws(() => apiOrigin(value));
  }
  assert.throws(() => apiOrigin('http://localhost:8080'));
  assert.equal(apiOrigin('http://localhost:8080', true), 'http://localhost:8080');
});

test('routes and permissions are deny-by-default, with non-delegable owner access', () => {
  const member = { permissions: ['attendance.manage', 'access.manage'] };
  assert.equal(can(member, 'attendance.manage'), true);
  assert.equal(can(member, 'access.manage'), false);
  assert.equal(can(member, 'xp.adjust'), false);
  assert.equal(can(null), false);
  assert.equal(can({ owner: true }, 'access.manage'), true);
  assert.equal(routeFor('#/admin/attendance')[1], 'attendance');
  assert.equal(routeFor('')[0], 'shop');
  assert.equal(routeFor('#/unknown'), undefined);
  assert.equal(routeFor('#/admin/attendance?fake=1'), undefined);
});

test('permission-first assignments preserve the role-based policy and permission order', () => {
  const original = { first: ['xp.adjust', 'attendance.manage'], second: ['audit.view'] };
  const assignments = {
    'attendance.manage': ['first', 'third'],
    'xp.adjust': ['first'],
    'audit.view': ['second', 'third'],
    'access.manage': ['first', 'third'],
  };
  assert.deepEqual(adminRolesFromPermissions(original, assignments), {
    first: ['xp.adjust', 'attendance.manage'],
    second: ['audit.view'],
    third: ['attendance.manage', 'audit.view'],
  });
  assert.deepEqual(original, {
    first: ['xp.adjust', 'attendance.manage'], second: ['audit.view'],
  });
});

test('clearing assignments removes empty and missing roles without delegating owner access', () => {
  assert.deepEqual(adminRolesFromPermissions({
    missing: ['attendance.manage'], old: ['xp.adjust'],
  }, { 'attendance.manage': [], 'xp.adjust': [], 'access.manage': ['owner-role'] }), {});
  assert.deepEqual(adminRolesFromPermissions({}, { 'attendance.manage': ['one', 'two'] }), {
    one: ['attendance.manage'], two: ['attendance.manage'],
  });
});

test('shop distinguishes completed, externally owned and pending products', () => {
  const item = { enabled: true, priceXp: 100 };
  assert.equal(productState({ ...item, purchased: true, owned: true }, 1000), 'purchased');
  assert.equal(productState({ ...item, purchased: true }, 1000), 'checkRole');
  assert.equal(productState({ ...item, owned: true }, 1000), 'owned');
  assert.equal(productState({ ...item, pending: true }, 1000), 'pending');
  assert.equal(productState(item, 99), 'insufficient');
  assert.equal(productState(item, 100), 'buy');
  assert.equal(productState({ ...item, enabled: false }, 100), 'disabled');
});

test('product validation protects immutable roles, Unicode bounds and safe prices', () => {
  const roles = [
    { id: 'a', manageable: true }, { id: 'b', dangerous: true },
    { id: 'c', managed: true }, { id: 'd', manageable: false },
  ];
  const item = { title: '역할', description: '<img src=x onerror=alert(1)>', roleId: 'a', priceXp: 100, sortOrder: 0, enabled: true };
  assert.equal(validateProduct(item, null, roles), true);
  assert.equal(validateProduct({ ...item, id: '1', version: 1 }, item, roles), false);
  assert.equal(validateProduct({ ...item, enabled: false, roleId: undefined }, null, roles), false);
  assert.equal(validateProduct({ ...item, title: '가'.repeat(101) }, null, roles), false);
  assert.equal(validateProduct({ ...item, description: '가'.repeat(4097) }, null, roles), false);
  assert.equal(validateProduct({ ...item, priceXp: -1 }, null, roles), false);
  assert.equal(validateProduct({ ...item, priceXp: 0 }, null, roles), false);
  assert.equal(validateProduct({ ...item, sortOrder: -1000000 }, null, roles), true);
  ['b', 'c', 'd'].forEach((roleId) => assert.equal(validateProduct({ ...item, roleId }, null, roles), false));
  assert.equal(validateProduct({ ...item, roleId: 'b' }, { ...item, roleLocked: true }, roles), false);
  assert.equal(validateProduct(item, { ...item, roleLocked: true }, []), false);
  assert.equal(validateProduct({ ...item, enabled: false }, { ...item, roleLocked: true }, []), true);
  assert.equal(validateProduct({ ...item, roleId: 'b', enabled: false }, { ...item, roleId: 'b' }, roles), true);
  assert.equal(validateProduct({ ...item, roleId: 'b', enabled: false }, null, roles), false);
  assert.equal(shortDescription('😀'.repeat(101)).length, 100);
  assert.equal(shortDescription(`a${'😀'.repeat(100)}`).isWellFormed(), true);
  assert.equal(shortDescription(' 긴\n 설명 '), '긴 설명');
});

test('all basic games have exact 94% RTP including selectable outcomes and milli-XP payouts', () => {
  ['slots', 'wheel', 'oddEven', 'dice'].forEach((kind) => {
    const game = {
      mode: 'basic', targetRtp: 94, minBetXp: 1, maxBetXp: 1000,
      maxPayoutXp: 10000, cooldownSeconds: 10,
      outcomes: basicOutcomes({}, 94, kind),
    };
    const preview = validateGame(game, kind);
    assert.ok(Math.abs(preview.theoretical - 94) < 1e-8, kind);
    const atOne = gamePreview(game, 1, kind);
    assert.ok(Math.abs(atOne.actual - 94) < 1e-8, kind);
    assert.equal(atOne.exact, true);
    if (kind === 'oddEven') assert.deepEqual(atOne.rows.map(({ payout }) => payout), [1.88, 0]);
    if (kind === 'dice') assert.ok(Math.abs(gamePreview(game, 1, kind, '6').actual - 94) < 1e-8);
    assert.throws(() => validateGame({ ...game, maxPayoutXp: 1 }, kind), /invalidGame/);
  });
  assert.throws(() => basicOutcomes({}, 94.0001, 'slots'), /gamePrecision/);
  const game = {
    mode: 'advanced', minBetXp: 1, maxBetXp: 10, cooldownSeconds: 10, maxPayoutXp: 100,
    outcomes: [{ id: 'odd', weight: 3, multiplierMilli: 1880 }, { id: 'even', weight: 1, multiplierMilli: 1880 }],
  };
  assert.throws(() => validateGame(game, 'oddEven'), /invalidGame/);
});

test('advanced probabilities are calculated per choice and payout caps are not clipping', () => {
  const game = { outcomes: [{ id: 'odd', weight: 3, multiplierMilli: 1880 }, { id: 'even', weight: 1, multiplierMilli: 1880 }] };
  assert.equal(gamePreview(game, 10, 'oddEven', 'odd').actual, 141);
  assert.equal(gamePreview(game, 10, 'oddEven', 'even').actual, 47);
  assert.equal(gamePreview(game, 10, 'oddEven', 'odd').maximum, 18.8);
  assert.throws(() => gamePreview({ outcomes: [{ id: 'a', weight: -1, multiplierMilli: 1 }] }), /invalidGame/);
});

test('request comparison is deterministic and size limit measures UTF-8 bytes', () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.equal(requestSize({ a: '가' }), 11);
});

test('client level preview matches shared server formula at boundaries', () => {
  [0, 1, 100, 1000, 12345, 10000000].forEach((xp) => {
    assert.equal(levelForXp(xp), Math.floor(Math.sqrt((3 * Math.floor(xp) + 4) / 100)));
  });
});
