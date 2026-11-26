import { basicOutcomes } from '../scripts/off-record-core.js';

export const permissions = [
  'attendance.manage', 'lifecycle.manage', 'access.manage', 'gift.manage', 'nickname.manage',
  'games.manage', 'raffle.manage', 'raffle.execute', 'xp.adjust', 'shop.manage',
  'orders.manage', 'admin.view', 'audit.view',
];
export const profile = { xp: 1000, level: 5, rank: 11 };
export const member = {
  user: { id: '123456789012345678', displayName: '기록하는 사람' },
  owner: true, permissions, permissionCatalog: permissions, profile,
  attendance: { total: 24, streak: 8, totalRank: 7, streakRank: 3 },
};
export const roles = [
  { id: '123456789012345001', name: '보라빛 기록', manageable: true },
  { id: '123456789012345002', name: '서버 관리자', manageable: true, dangerous: true },
  { id: '123456789012345003', name: '통합 역할', manageable: false, managed: true },
];
const product = {
  id: '1', version: 2, title: '보라빛 기록', description: '우리만의 특별한 역할이에요.',
  roleId: roles[0].id, priceXp: 100, sortOrder: 1, enabled: true,
};
export const products = [
  product, { ...product, id: '2', title: '완료한 기록', purchased: true, owned: true },
  { ...product, id: '3', title: '이미 보유한 역할', owned: true },
  { ...product, id: '4', title: '지급 중인 역할', pending: true },
  { ...product, id: '5', title: '<img src=x onerror=alert(1)>', description: '<script>danger()</script>', priceXp: 1500 },
];
export const sections = Object.fromEntries(Object.entries({
  attendance: { rewardXp: 500 }, lifecycle: { resetOnLeave: true },
  access: { adminRoles: { [roles[0].id]: ['attendance.manage'] } },
  gift: { enabled: true, feePercent: 15 },
  shop: { enabled: true },
  nickname: { enabled: false, template: '[lv.{레벨}]', excludedRoleIds: [] },
  raffle: { maxWinners: 50, maxAmountXp: 10000, maxTotalXp: 100000, previewTtlSeconds: 300 },
  games: Object.fromEntries(['slots', 'wheel', 'oddEven', 'dice'].map((kind) => [kind, {
    enabled: true, mode: 'basic', targetRtp: 94, minBetXp: 1, maxBetXp: 1000,
    cooldownSeconds: 10, maxPayoutXp: 10000, allowedRoleIds: [], allowedChannelIds: [],
    outcomes: basicOutcomes({}, 94, kind),
  }])),
}).map(([id, value]) => [id, { version: 1, value }]));

export function fixtureResponse(path) {
  const url = new URL(path, 'https://api.offrecord.test');
  if (url.pathname === '/api/me') return member;
  if (url.pathname === '/api/members') return { items: (url.searchParams.get('ids') || '').split(',').map((userId) => ({
    userId, displayName: userId === member.user.id ? member.user.displayName : null,
  })) };
  if (url.pathname === '/api/shop') return { items: products, profile, enabled: true };
  if (url.pathname === '/api/roles') return { items: roles };
  if (url.pathname === '/api/settings') return { sections };
  if (url.pathname === '/api/rankings') {
    return { items: [{ userId: member.user.id, displayName: '기록하는 사람', rank: 1, xp: 1000, total: 24, streak: 8 }], own: { rank: 11, xp: 1000, total: 24, streak: 8 } };
  }
  if (url.pathname === '/api/admin/summary') return { members: 120, balanceMilli: 123000000, orders: { pending: 2 }, nickname: { queued: 8 } };
  if (url.pathname === '/api/jobs') return { items: [{ id: 1, userId: member.user.id, displayName: member.user.displayName, state: 'queued', attempts: 0 }], sweep: { active: true }, counts: { queued: 8 } };
  if (url.pathname === '/api/raffles/preview') return { previewId: 'snapshot-1', candidateCount: 120, winners: 1, amountXp: 100, totalXp: 100, expiresAt: new Date(Date.now() + 300000).toISOString() };
  if (url.pathname === '/api/orders') return { items: [{ id: 1, userId: member.user.id, displayName: member.user.displayName, product, amountXp: 100, status: 'pending', createdAt: new Date().toISOString() }] };
  return { items: [] };
}
