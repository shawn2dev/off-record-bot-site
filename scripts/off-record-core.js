export const ROUTES = [
  ['shop', 'shop'], ['ranking', 'ranking'], ['me', 'me'],
  ['admin', 'summary', 'admin.view'], ['admin/attendance', 'attendance', 'attendance.manage'],
  ['admin/lifecycle', 'lifecycle', 'lifecycle.manage'], ['admin/gift', 'gift', 'gift.manage'],
  ['admin/nickname', 'nickname', 'nickname.manage'], ['admin/games', 'games', 'games.manage'],
  ['admin/raffle', 'raffle', ['raffle.manage', 'raffle.execute']],
  ['admin/products', 'products', 'shop.manage'], ['admin/orders', 'orders', 'orders.manage'],
  ['admin/audit', 'audit', 'audit.view'], ['admin/xp', 'xp', 'xp.adjust'],
  ['admin/access', 'access', 'access.manage'],
];

export function can(me, permission) {
  if (!me) return false;
  if (me.owner) return true;
  if (!permission) return true;
  if (permission === 'access.manage') return false;
  return [].concat(permission).some((id) => me.permissions?.includes(id));
}

export function adminRolesFromPermissions(original, assignments) {
  const roles = new Set([...Object.keys(original), ...Object.values(assignments).flat()]);
  return Object.fromEntries([...roles].map((roleId) => {
    const granted = Object.entries(assignments)
      .filter(([permission, ids]) => permission !== 'access.manage' && ids.includes(roleId))
      .map(([permission]) => permission);
    const previous = original[roleId] || [];
    return [roleId, [
      ...previous.filter((permission) => granted.includes(permission)),
      ...granted.filter((permission) => !previous.includes(permission)),
    ]];
  }).filter(([, permissions]) => permissions.length));
}

export function routeFor(hash) {
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '') || 'shop';
  return ROUTES.find(([id]) => id === path);
}

export function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(Number(value)) && String(value).trim() !== ''
    && Number(value) >= min && Number(value) <= max;
}

export function safeRole(role) {
  return Boolean(role) && !role.managed && !role.dangerous && role.manageable !== false;
}

export function validateProduct(product, original, roles) {
  const sameRole = Boolean(original) && original.roleId === product.roleId;
  const allowedRole = (product.enabled === false && sameRole)
    || safeRole(roles.find(({ id }) => id === product.roleId));
  return Object.keys(product).every((key) => (
    ['title', 'description', 'roleId', 'priceXp', 'sortOrder', 'enabled'].includes(key)
  )) && typeof product.enabled === 'boolean'
    && typeof product.title === 'string' && typeof product.description === 'string'
    && product.title.trim().length > 0
    && product.title.length <= 100 && product.description.length <= 4096
    && integer(product.priceXp, 1, 1000000000) && integer(product.sortOrder, -1000000, 1000000)
    && (!original?.roleLocked || sameRole) && allowedRole;
}

export function productState(product, balance, shopEnabled = true) {
  if (product.purchased) return product.owned ? 'purchased' : 'checkRole';
  if (product.pending) return 'pending';
  if (product.owned) return 'owned';
  if (!product.enabled || !shopEnabled) return 'disabled';
  if (Number(balance) < product.priceXp) return 'insufficient';
  return 'buy';
}

export function shortDescription(value) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 100)
    .replace(/[\uD800-\uDBFF]$/, '');
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function requestSize(body) {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

export const BASIC_TABLES = {
  slots: [['lose', 75, 0], ['pair', 20, 30], ['triple', 5, 80]],
  wheel: [['blank', 50, 0], ['one', 30, 10], ['two', 15, 20], ['eight', 5, 80]],
  oddEven: [['odd', 1, 20], ['even', 1, 20]],
  dice: ['1', '2', '3', '4', '5', '6'].map((id) => [id, 1, 60]),
};

export function gamePreview(game, amount = game.minBetXp, kind = 'slots', choice = game.outcomes?.[0]?.id) {
  const outcomes = game.outcomes || [];
  if (!Array.isArray(outcomes)) throw new Error('invalidGame');
  const weight = outcomes.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!weight || weight > 1000000 || outcomes.length < 2 || outcomes.length > 25) throw new Error('invalidGame');
  if (new Set(outcomes.map(({ id }) => id)).size !== outcomes.length) throw new Error('invalidGame');
  let maximum = 0;
  let expected = 0;
  let exact = true;
  const rows = outcomes.map((item) => {
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(item.id)
      || !integer(item.weight, 1, 1000000) || !integer(item.multiplierMilli, 0, 1000000)) {
      throw new Error('invalidGame');
    }
    const raw = Number(amount) * item.multiplierMilli;
    if (!Number.isSafeInteger(raw)) throw new Error('invalidGame');
    const selectable = ['oddEven', 'dice'].includes(kind);
    const payout = selectable && item.id !== choice ? 0 : raw / 1000;
    exact = exact && Number.isSafeInteger(raw);
    const probability = item.weight / weight;
    expected += probability * payout;
    maximum = Math.max(maximum, raw / 1000);
    return { ...item, probability, payout };
  });
  const theoretical = rows.reduce((sum, item) => (
    sum + ((item.probability * (
      ['oddEven', 'dice'].includes(kind) && item.id !== choice ? 0 : item.multiplierMilli
    )) / 10)
  ), 0);
  return {
    rows,
    totalWeight: weight,
    theoretical,
    actual: Number(amount) ? (expected / amount) * 100 : 0,
    exact,
    maximum,
    maxLoss: Number(amount),
    maxWin: maximum - Number(amount),
  };
}

export function basicOutcomes(game, targetRtp, kind = 'slots') {
  if (!Number.isFinite(Number(targetRtp)) || targetRtp < 0 || targetRtp > 100) throw new Error('invalidGame');
  return BASIC_TABLES[kind].map(([id, weight, coefficient]) => {
    const scaled = coefficient * Number(targetRtp);
    if (Math.abs(scaled - Math.round(scaled)) > 1e-7) throw new Error('gamePrecision');
    return { id, weight, multiplierMilli: Math.round(scaled) };
  });
}

export function validateGame(game, kind = 'slots') {
  if (!['basic', 'advanced'].includes(game.mode)
    || !integer(game.minBetXp, 1, 1000000)
    || !integer(game.maxBetXp, Number(game.minBetXp), 1000000)
    || !integer(game.cooldownSeconds, 0, 86400)
    || !integer(game.maxPayoutXp, 1, 1000000000)) throw new Error('invalidGame');
  const preview = gamePreview(game, game.maxBetXp, kind);
  if (!preview.exact) throw new Error('gamePrecision');
  if (preview.maximum > Number(game.maxPayoutXp)) throw new Error('invalidGame');
  if (game.mode === 'basic' && Math.abs(preview.theoretical - game.targetRtp) > 1e-7) {
    throw new Error('gamePrecision');
  }
  if (['oddEven', 'dice'].includes(kind)) {
    const ids = BASIC_TABLES[kind].map(([id]) => id);
    if (canonical(ids.slice().sort()) !== canonical(game.outcomes.map(({ id }) => id).sort())) {
      throw new Error('invalidGame');
    }
    if (ids.some((id) => gamePreview(game, game.maxBetXp, kind, id).theoretical > 100)) {
      throw new Error('invalidGame');
    }
  } else if (preview.theoretical > 100) throw new Error('invalidGame');
  return preview;
}
