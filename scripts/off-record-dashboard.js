/* eslint no-use-before-define: ["error", { "functions": false }] */
import { API_ORIGIN } from './off-record-config.js';
import { OffRecordClient } from './off-record-auth.js';
import {
  ROUTES, can, routeFor, integer, safeRole, validateProduct, productState,
  shortDescription, canonical, gamePreview, basicOutcomes, validateGame,
} from './off-record-core.js';
import { t, number, date } from './off-record-locale.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => (value === undefined || value === null ? '—' : String(value));

export function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = text(value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value !== undefined) node.setAttribute(key, value === true ? '' : value);
  });
  [].concat(children).filter((child) => child !== undefined && child !== null).forEach((child) => {
    node.append(child instanceof Node ? child : document.createTextNode(text(child)));
  });
  return node;
}

const p = (key, className = '') => element('p', { class: className, text: t(key) });
const button = (key, action, className = '', attributes = {}) => element('button', {
  type: 'button', class: className, text: t(key), onclick: action, ...attributes,
});
const card = (children, className = '') => element('section', { class: `or-card ${className}` }, children);
const badge = (key) => element('span', { class: 'or-badge', text: t(key) });
const heading = (key, level = 2) => element(`h${level}`, { text: t(key) });

function field(key, value, options = {}) {
  const id = `or-field-${field.sequence += 1}`;
  let input;
  if (options.type === 'select') {
    const attributes = { id, name: key, multiple: options.multiple };
    input = element('select', attributes, options.items.map((item) => {
      const selected = options.multiple
        ? (value || []).includes(item.id) : String(value) === item.id;
      return element('option', { value: item.id, disabled: item.disabled, selected }, item.label);
    }));
  } else if (options.type === 'textarea') {
    input = element('textarea', {
      id,
      name: key,
      rows: options.rows || 4,
      maxlength: options.maxlength,
      required: options.required,
    });
    input.value = value || '';
  } else {
    input = element('input', {
      id,
      name: key,
      type: options.type || 'text',
      min: options.min,
      max: options.max,
      step: options.step,
      maxlength: options.maxlength,
      required: options.required,
    });
    if (options.type === 'checkbox') input.checked = !!value;
    else input.value = value ?? '';
  }
  input.disabled = !!options.disabled;
  const label = element('label', { for: id, text: t(key) });
  const node = element('div', { class: `or-field ${options.type === 'checkbox' ? 'or-toggle' : ''}` }, [label, input]);
  return {
    node,
    input,
    read: () => {
      if (options.type === 'checkbox') return input.checked;
      if (options.type === 'number') return Number(input.value);
      if (options.multiple) {
        const selected = [...input.selectedOptions].map((option) => option.value);
        const original = value || [];
        return [
          ...original.filter((selectedId) => selected.includes(selectedId)),
          ...selected.filter((selectedId) => !original.includes(selectedId)),
        ];
      }
      return input.value;
    },
  };
}
field.sequence = 0;

const numeric = (key, value, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1) => (
  field(key, value, {
    type: 'number', min, max, step, required: true,
  })
);
const toggle = (key, value) => field(key, value, { type: 'checkbox' });

function roleField(key, value, roles, {
  multiple = false, locked = false, all = false, restricted = false,
} = {}) {
  const items = roles.map((role) => ({
    id: role.id, label: role.name, disabled: restricted && !safeRole(role),
  }));
  if (multiple) {
    (value || []).filter((id) => !items.some((item) => item.id === id)).forEach((id) => {
      items.push({ id, label: id, disabled: false });
    });
  }
  if (!multiple) items.unshift({ id: '', label: t(all ? 'allMembers' : 'chooseRole') });
  if (value && !multiple && !items.some(({ id }) => id === value)) {
    items.push({ id: value, label: value, disabled: true });
  }
  return field(key, value, {
    type: 'select', multiple, items, disabled: locked,
  });
}

function pairs(values) {
  return element('dl', { class: 'or-pairs' }, values.flatMap(([label, value]) => [
    element('dt', { text: t(label) }), element('dd', { text: value }),
  ]));
}

function details(value) {
  return element('pre', { class: 'or-json', text: JSON.stringify(value, null, 2) });
}

function resultView(result) {
  const values = [];
  if (result.game) values.push(['games', t(result.game)], ['result', outcomeLabel(result.outcome)]);
  if (result.userId) values.push(['userId', result.userId]);
  if (result.amountXp !== undefined) values.push(['amount', `${number(result.amountXp)} ${t('xpUnit')}`]);
  if (result.feeXp !== undefined) values.push(['fee', `${number(result.feeXp)} ${t('xpUnit')}`]);
  if (result.receivedXp !== undefined) values.push(['recipientGets', `${number(result.receivedXp)} ${t('xpUnit')}`]);
  if (result.payoutXp !== undefined) values.push(['payout', `${number(result.payoutXp)} ${t('xpUnit')}`]);
  if (result.netXp !== undefined) values.push(['netXp', `${number(result.netXp)} ${t('xpUnit')}`]);
  if (result.reason) values.push(['reason', result.reason]);
  if (result.profile) {
    values.push(['balance', `${number(result.profile.xp)} ${t('xpUnit')}`], ['level', number(result.profile.level)]);
  }
  if (result.totalXp !== undefined) values.push(['totalXp', `${number(result.totalXp)} ${t('xpUnit')}`]);
  const node = element('div', { class: 'or-result' }, [pairs(values)]);
  if (Array.isArray(result.winners)) {
    node.append(element('ol', {}, result.winners.map((winner) => element('li', {
      text: `${winner.userId} · ${number(winner.amountXp)} ${t('xpUnit')}`,
    }))));
  }
  node.append(element('details', {}, [
    element('summary', { text: t('recordDetails') }), details(result),
  ]));
  return node;
}

function formValues(container) {
  return [...container.querySelectorAll('input, textarea, select')].map((input) => {
    if (input.type === 'checkbox') return input.checked;
    if (input.multiple) return [...input.selectedOptions].map(({ value }) => value);
    return input.value;
  });
}

function restoreValues(container, values = []) {
  [...container.querySelectorAll('input, textarea, select')].forEach((input, index) => {
    const value = values[index];
    if (value === undefined) return;
    if (input.type === 'checkbox') input.checked = value;
    else if (input.multiple) {
      [...input.options].forEach((option) => { option.selected = value.includes(option.value); });
    } else input.value = value;
  });
}

async function confirmAction(title, content, actionLabel = 'confirm') {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const dialog = element('dialog', { class: 'off-record-dialog', 'aria-labelledby': 'or-dialog-title' });
    const finish = (accepted) => {
      dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(accepted);
    };
    dialog.append(
      element('h2', { id: 'or-dialog-title', text: t(title) }),
      element('div', { class: 'or-dialog-content' }, [].concat(content)),
      element('div', { class: 'or-actions' }, [
        button('cancel', () => finish(false), 'or-secondary'),
        button(actionLabel, () => finish(true)),
      ]),
    );
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('button').focus();
  });
}

export class Dashboard {
  constructor(root, client) {
    this.root = root;
    this.client = client;
    this.me = null;
    this.currentRoute = '';
    this.generation = 0;
    this.dirtyForms = new Set();
    this.message = '';
    this.busy = false;
  }

  get dirty() {
    return this.dirtyForms.size > 0;
  }

  markDirty(id, changed) {
    if (changed) this.dirtyForms.add(id);
    else this.dirtyForms.delete(id);
  }

  async initialize() {
    this.shell();
    try {
      const result = await this.client.initialize();
      if (result.hash && routeFor(result.hash)) {
        window.history.replaceState(null, '', `${window.location.pathname}#/${routeFor(result.hash)[0]}`);
      }
      if (result.setup) this.setup();
      else if (this.client.token) {
        await this.loadMember();
        await this.render();
      } else this.login(result.error);
    } catch (error) {
      this.login();
      this.error(error);
    }
    window.addEventListener('hashchange', async () => {
      const next = window.location.hash;
      if (this.dirty && !(await confirmAction('dirty', p('leaveConfirm')))) {
        window.history.replaceState(null, '', `${window.location.pathname}#/${this.currentRoute}`);
        return;
      }
      if (next !== window.location.hash) return;
      this.render();
    });
    window.addEventListener('beforeunload', (event) => {
      if (this.dirty && !this.authNavigating) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  shell() {
    document.documentElement.lang = 'ko';
    const navId = 'or-navigation';
    this.nav = element('nav', { id: navId, 'aria-label': t('menu') });
    const menuButton = button('menu', () => {
      const expanded = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!expanded));
      this.root.classList.toggle('or-menu-open', !expanded);
    }, 'or-menu-button or-secondary', { 'aria-controls': navId, 'aria-expanded': 'false' });
    this.account = element('div', { class: 'or-account' });
    this.notice = element('div', { class: 'or-notice', role: 'status', 'aria-live': 'polite' });
    this.pendingArea = element('div', { class: 'or-pending' });
    this.content = element('div', { id: 'or-content', class: 'or-content', tabindex: '-1' });
    this.root.replaceChildren(
      element('a', {
        class: 'or-skip',
        href: '#or-content',
        text: t('skip'),
        onclick: (event) => { event.preventDefault(); this.content.focus(); },
      }),
      element('aside', { class: 'or-sidebar' }, [
        element('a', { class: 'or-brand', href: '#/shop' }, [
          element('span', { class: 'or-logo', 'aria-hidden': 'true', text: 'OR' }),
          element('span', {}, [element('strong', { text: t('brand') }), element('small', { text: t('subtitle') })]),
        ]),
        menuButton, this.nav,
        element('div', { class: 'or-sidebar-note', text: t('dashboard') }),
      ]),
      element('div', { class: 'or-workspace' }, [
        element('header', { class: 'or-topbar' }, [p('dashboard'), this.account]),
        this.notice, this.pendingArea, this.content,
      ]),
    );
    this.navigation();
  }

  navigation() {
    this.nav.replaceChildren();
    const groups = [
      ['member', ROUTES.filter(([, , permission]) => !permission)],
      ['management', ROUTES.filter(([, , permission]) => permission && permission !== 'access.manage')],
      ['ownerGroup', ROUTES.filter(([, , permission]) => permission === 'access.manage')],
    ];
    groups.forEach(([label, routes]) => {
      const visible = routes.filter(([, , permission]) => can(this.me, permission));
      if (!visible.length) return;
      this.nav.append(p(label, 'or-nav-heading'));
      visible.forEach(([id, title]) => {
        this.nav.append(element('a', {
          href: `#/${id}`,
          text: t(title),
          'aria-current': this.currentRoute === id ? 'page' : undefined,
          onclick: () => {
            this.root.classList.remove('or-menu-open');
            this.root.querySelector('.or-menu-button').setAttribute('aria-expanded', 'false');
          },
        }));
      });
    });
    this.account.replaceChildren();
    if (this.me) {
      this.account.append(
        element('span', { text: this.me.user.displayName }),
        button('logout', () => this.logout(), 'or-secondary'),
      );
    }
    this.renderPending();
  }

  setup(invalid = false) {
    this.content.replaceChildren(card([heading('setupTitle', 1), p(invalid ? 'configInvalid' : 'setupHelp')], 'or-state'));
  }

  login(errorKey) {
    this.me = null;
    this.dirtyForms.clear();
    this.navigation();
    this.content.replaceChildren(card([
      heading('loginTitle', 1), p(errorKey || 'loginHelp'),
      button('login', () => this.signIn(false)),
    ], 'or-state'));
  }

  async signIn(restore) {
    this.authNavigating = true;
    try {
      const started = await this.client.startLogin(restore);
      if (!started) {
        this.authNavigating = false;
        this.login('sessionExpired');
      }
    } catch (error) {
      this.authNavigating = false;
      this.error(error);
    }
  }

  async logout() {
    if (this.dirty && !(await confirmAction('dirty', p('leaveConfirm')))) return;
    try { await this.client.logout(); } catch (error) { this.error(error); }
    this.login();
  }

  async loadMember() {
    this.me = await this.client.request('/api/me');
    this.client.bindActor(this.me.user.id);
    this.navigation();
  }

  async refreshMember() {
    try {
      await this.loadMember();
      return true;
    } catch (error) {
      this.error(error);
      return false;
    }
  }

  error(error) {
    const local = ['storageFailed', 'setupHelp', 'configInvalid', 'pendingConflict', 'tooLarge', 'sessionExpired'];
    const message = local.includes(error.code) ? t(error.code) : (error.message || t('error'));
    this.notice.replaceChildren(
      element('p', { class: 'or-error', text: error.status === 409 ? t('stale') : message }),
    );
    if (error.status === 409 && error.message && error.message !== error.code) {
      this.notice.append(element('p', { class: 'or-error', text: error.message }));
    }
    if (error.retryAfter) this.notice.append(p('retryAfter'), element('span', { text: error.retryAfter }));
    if (error.status === 401) this.signIn(true);
    this.renderPending();
  }

  success(key = 'requestSuccess') {
    this.notice.replaceChildren(element('p', { class: 'or-success', text: t(key) }));
  }

  async getRoles() {
    if (!this.roles) {
      const items = [];
      const seen = new Set();
      let cursor;
      for (let page = 0; page < 10; page += 1) {
        const path = cursor ? `/api/roles?after=${encodeURIComponent(cursor)}` : '/api/roles';
        // Each page depends on the cursor returned by the preceding page.
        // eslint-disable-next-line no-await-in-loop
        const response = await this.client.request(path);
        items.push(...(response.items || []));
        cursor = response.nextCursor;
        if (!cursor || seen.has(cursor)) break;
        seen.add(cursor);
      }
      this.roles = [...new Map(items.map((role) => [role.id, role])).values()];
    }
    return this.roles;
  }

  renderPending() {
    this.pendingArea.replaceChildren();
    if (!this.me) return;
    const records = Object.entries(this.client.state.requests);
    if (!records.length) return;
    const container = element('details', {}, [
      element('summary', { text: `${t('pendingTitle')} · ${number(records.length)}` }), p('pendingHelp'),
    ]);
    records.forEach(([id, request]) => {
      container.append(card([
        pairs([['action', request.path], ['createdAt', date(request.at)]]),
        element('details', {}, [element('summary', { text: t('requestBody') }), details(request.body)]),
        element('div', { class: 'or-actions' }, [
          button('retryOriginal', async () => {
            try {
              const { key, ...body } = request.body;
              const result = await this.mutate(id, request.path, body, {
                method: request.method,
                title: 'pendingTitle',
                preview: [p('pendingHelp'), details(request.body)],
              });
              if (result) {
                if (await this.refreshMember()) await this.render();
              }
            } catch { /* The same saved request remains available if the retry failed. */ }
          }),
          button('clearPending', async () => {
            if (await confirmAction('clearPending', p('clearPendingHelp'))) {
              this.client.forget(id);
              this.renderPending();
            }
          }, 'or-secondary'),
        ]),
      ]));
    });
    this.pendingArea.append(container);
  }

  async mutate(id, path, body, {
    method = 'POST', title = 'confirm', preview, draftId = id, keyed = true,
  } = {}) {
    if (this.busy) return null;
    this.busy = true;
    try {
      if (!(await confirmAction(title, preview || p('danger')))) return null;
      this.client.prepare(id, path, body, method, { keyed });
      this.renderPending();
      this.notice.replaceChildren(p('requestSending'));
      const result = await this.client.submit(id);
      this.client.clearDraft(draftId);
      this.markDirty(draftId, false);
      this.success();
      this.renderPending();
      return result;
    } catch (error) {
      this.error(error);
      throw error;
    } finally { this.busy = false; }
  }

  async render() {
    if (!this.me) return;
    this.generation += 1;
    const { generation } = this;
    const route = routeFor(window.location.hash);
    this.dirtyForms.clear();
    if (this.currentRoute !== (route?.[0] || '')) this.notice.replaceChildren();
    this.currentRoute = route?.[0] || '';
    this.navigation();
    if (!route || !can(this.me, route[2])) {
      document.title = `${t(route ? 'forbidden' : 'notFound')} · ${t('brand')}`;
      this.content.replaceChildren(card([
        heading(route ? 'forbidden' : 'notFound', 1),
        element('a', { href: '#/shop', text: t('home') }),
      ]));
      this.content.setAttribute('aria-busy', 'false');
      this.content.focus({ preventScroll: true });
      return;
    }
    document.title = `${t(route[1])} · ${t('brand')}`;
    this.content.replaceChildren(p('loading'));
    this.content.setAttribute('aria-busy', 'true');
    try {
      let view;
      const [id, label] = route;
      if (id === 'shop') view = await this.shop();
      else if (id === 'ranking') view = await this.rankings();
      else if (id === 'me') view = await this.profile();
      else if (id === 'admin') view = await this.summary();
      else if (id === 'admin/products') view = await this.products();
      else if (id === 'admin/orders') view = await this.orderPage();
      else if (id === 'admin/audit') view = await this.records('/api/audit', 'audit');
      else if (id === 'admin/xp') view = this.xpAdjust();
      else view = await this.settingsPage(id.split('/')[1]);
      if (generation !== this.generation) return;
      this.content.replaceChildren(
        element('div', { class: 'or-page-heading' }, [
          heading(label, 1),
          button('refresh', async () => {
            if (this.dirty && !(await confirmAction('dirty', p('leaveConfirm')))) return;
            try {
              this.roles = null;
              await this.loadMember();
              await this.render();
            } catch (error) { this.error(error); }
          }, 'or-secondary'),
        ]),
        view,
      );
      this.content.focus({ preventScroll: true });
    } catch (error) {
      if (generation !== this.generation) return;
      this.content.replaceChildren(card([
        heading(error.status === 403 ? 'forbidden' : 'error'),
        button('retry', () => this.render()),
      ], 'or-state'));
      this.error(error);
    } finally {
      if (generation === this.generation) this.content.setAttribute('aria-busy', 'false');
    }
  }

  metrics(profile = this.me.profile, attendance = this.me.attendance) {
    return element('div', { class: 'or-metrics' }, [
      card([p('balance'), element('strong', { text: `${number(profile?.xp)} ${t('xpUnit')}` })]),
      card([p('level'), element('strong', { text: number(profile?.level) })]),
      card([p('total'), element('strong', { text: `${number(attendance?.total)} ${t('day')}` })]),
      card([p('streak'), element('strong', { text: `${number(attendance?.streak)} ${t('day')}` })]),
    ]);
  }

  async shop() {
    const data = await this.client.request('/api/shop');
    const balance = data.profile?.xp ?? this.me.profile?.xp ?? 0;
    const grid = element('div', { class: 'or-grid' });
    const append = (items) => items.forEach((product) => {
      const state = productState(product, balance, data.enabled);
      const buyButton = button(state, async () => {
        const remaining = balance - product.priceXp;
        const preview = [
          element('h3', { text: product.title }),
          element('p', { class: 'or-description', text: product.description }),
          pairs([
            ['price', `${number(product.priceXp)} ${t('xpUnit')}`], ['role', product.roleId],
            ['productVersion', product.version], ['afterBalance', `${number(remaining)} ${t('xpUnit')}`],
            ['afterLevel', product.expectedLevel ?? levelForXp(remaining)],
          ]), p('purchaseHelp'),
        ];
        try {
          const result = await this.mutate(`purchase:${product.id}`, '/api/purchases', {
            productId: product.id, version: product.version,
          }, { title: 'buyConfirm', preview });
          if (result) {
            if (await this.refreshMember()) await this.render();
          }
        } catch { /* The immutable request remains available in the pending panel. */ }
      }, '', { disabled: state !== 'buy' });
      grid.append(card([
        element('div', { class: 'or-card-top' }, [badge(state === 'buy' ? 'role' : state)]),
        element('h2', { text: product.title }),
        element('p', { class: 'or-description', text: product.description }),
        element('span', { class: 'or-muted', text: `${t('role')} · ${product.roleId}` }),
        element('strong', { class: 'or-price', text: `${number(product.priceXp)} ${t('xpUnit')}` }),
        buyButton,
      ], 'or-product'));
    });
    append(data.items || []);
    if (!grid.children.length) grid.append(p('empty'));
    const view = element('div', {}, [
      p(data.enabled === false ? 'shopDisabled' : 'shopHelp'), this.metrics(data.profile), grid,
    ]);
    this.appendMore(view, data, '/api/shop', append, 'after');
    return view;
  }

  async rankings() {
    const view = element('div');
    const result = element('div', { id: 'or-ranking-panel', role: 'tabpanel' });
    const tabs = element('div', { class: 'or-tabs', role: 'tablist', 'aria-label': t('ranking') });
    let active = 0;
    const load = async (kind) => {
      active += 1;
      const generation = active;
      result.replaceChildren(p('loading'));
      [...tabs.children].forEach((tab) => {
        const selected = tab.dataset.kind === kind;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      result.setAttribute('aria-labelledby', `or-ranking-tab-${kind}`);
      try {
        const data = await this.client.request(`/api/rankings?kind=${kind}`);
        if (generation !== active) return;
        const rankValue = (item) => item[kind] ?? item.value ?? item.count;
        const rows = (data.items || []).slice(0, 10).map((item) => element('li', { class: 'or-ranking-row' }, [
          element('strong', { text: number(item.rank) }),
          element('span', { text: item.displayName || item.user?.displayName || item.userId }),
          element('span', { text: `${number(rankValue(item))} ${kind === 'xp' ? t('xpUnit') : t('day')}` }),
        ]));
        result.replaceChildren(
          rows.length ? element('ol', { class: 'or-ranking-list' }, rows) : p('empty'),
          data.own ? card([heading('myRank'), pairs([
            ['rank', number(data.own.rank)],
            [kind === 'xp' ? 'amount' : kind, `${number(rankValue(data.own))} ${t(kind === 'xp' ? 'xpUnit' : 'day')}`],
          ])]) : p('noRank'),
        );
      } catch (error) {
        result.replaceChildren(p('error'), button('retry', () => load(kind)));
        this.error(error);
      }
    };
    ['xp', 'total', 'streak'].forEach((kind) => {
      const tab = button(`${kind}Rank`, () => load(kind), 'or-secondary', {
        id: `or-ranking-tab-${kind}`,
        role: 'tab',
        'aria-selected': kind === 'xp',
        'aria-controls': 'or-ranking-panel',
        tabindex: kind === 'xp' ? '0' : '-1',
      });
      tab.dataset.kind = kind;
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...tabs.children];
        const index = buttons.indexOf(tab);
        let next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = 2;
        buttons[next].focus();
        buttons[next].click();
      });
      tabs.append(tab);
    });
    view.append(tabs, result);
    await load('xp');
    return view;
  }

  async profile() {
    const [orders, ledger] = await Promise.all([
      this.records('/api/orders', 'purchaseHistory'), this.records('/api/ledger', 'ledger'),
    ]);
    return element('div', {}, [
      this.metrics(), pairs([
        ['rank', this.me.profile?.rank ?? t('noRank')],
        ['totalRank', this.me.attendance?.totalRank ?? t('noRank')],
        ['streakRank', this.me.attendance?.streakRank ?? t('noRank')],
      ]), this.giftForm(), this.gameForm(), orders, ledger,
    ]);
  }

  async records(path, title, management = false) {
    const data = await this.client.request(path);
    const list = element('div', { class: 'or-records' });
    const append = (items) => {
      items.forEach((item) => {
        const values = [
          ['id', item.id], ['name', item.title || item.product?.title || item.productTitle || item.displayName],
          ['kind', item.kind || item.type || item.action],
          ['status', translatedStatus(item.status || item.state)],
          ['amountXp', item.amountXp ?? item.amount
            ?? ((item.amountMilli ?? item.deltaMilli) === undefined
              ? undefined : (item.amountMilli ?? item.deltaMilli) / 1000)],
          ['balanceAfter', item.balanceAfterXp ?? item.balanceAfter
            ?? (item.balanceAfterMilli === undefined ? undefined : item.balanceAfterMilli / 1000)],
          ['userId', item.userId], ['actorId', item.actorId],
          ['reason', item.reason || item.error || item.errorCode],
          ['createdAt', item.createdAt ? date(item.createdAt) : undefined],
        ].filter(([, value]) => value !== undefined);
        const itemCard = card([pairs(values)]);
        if (item.details) {
          itemCard.append(element('details', {}, [
            element('summary', { text: t('recordDetails') }), details(item.details),
          ]));
        }
        if (management && can(this.me, 'orders.manage')) {
          const terminal = ['completed', 'refunded', 'refund_forfeited'].includes(item.status || item.state);
          itemCard.append(element('div', { class: 'or-actions' }, ['retry', 'complete', 'refund'].map((action) => (
            button(`${action}Order`, async () => {
              try {
                const result = await this.mutate(`order:${item.id}:${action}`, `/api/orders/${encodeURIComponent(item.id)}/action`, { action }, {
                  title: `${action}Order`, preview: [p('orderHelp'), pairs([['orderId', item.id], ['status', translatedStatus(item.status)]])],
                });
                if (result) this.render();
              } catch { /* The error and original request are shown by mutate. */ }
            }, action === 'refund' ? 'or-danger' : 'or-secondary', { disabled: terminal })
          ))));
        }
        list.append(itemCard);
      });
    };
    append(data.items || []);
    if (!list.children.length) list.append(p('empty'));
    const view = card([heading(title), list]);
    this.appendMore(view, data, path, (items) => append(items));
    return view;
  }

  appendMore(view, data, path, append, cursorKey = 'before') {
    if (!data.nextCursor) return;
    let cursor = data.nextCursor;
    const more = button('loadMore', async () => {
      more.disabled = true;
      try {
        const url = new URL(path, 'https://offrecord.invalid');
        url.searchParams.set(cursorKey, cursor);
        const next = await this.client.request(`${url.pathname}${url.search}`);
        append(next.items || []);
        cursor = next.nextCursor;
        if (!cursor) more.remove();
      } catch (error) { this.error(error); } finally { more.disabled = false; }
    }, 'or-secondary');
    view.append(more);
  }

  async orderPage() {
    return element('div', {}, [p('orderHelp'), await this.records('/api/orders?manage=true', 'orders', true)]);
  }

  async summary() {
    const data = await this.client.request('/api/admin/summary');
    const metrics = ['memberCount', 'totalBalanceXp', 'pendingCount', 'jobCount'];
    const normalized = {
      ...data,
      memberCount: data.memberCount ?? data.members,
      totalBalanceXp: data.totalBalanceXp ?? (Number(data.balanceMilli) / 1000),
      pendingCount: data.pendingCount ?? Object.entries(data.orders || {})
        .filter(([state]) => !['completed', 'refunded'].includes(state))
        .reduce((sum, [, count]) => sum + count, 0),
      jobCount: data.jobCount
        ?? Object.values(data.nickname || {}).reduce((sum, count) => sum + count, 0),
    };
    return this.summaryView(normalized, metrics);
  }

  summaryView(data, metrics) {
    const values = metrics.filter((key) => data[key] !== undefined);
    return element('div', {}, [
      element('div', { class: 'or-grid' }, values.map((key) => (
        card([p(key), element('strong', { class: 'or-stat', text: number(data[key]) })])
      ))),
      values.length ? null : p('empty'), button('refresh', () => this.render(), 'or-secondary'),
    ]);
  }

  giftForm() {
    const user = field('userId', '', { required: true, maxlength: 20 });
    const amount = numeric('amount', 1, 1);
    const form = this.actionForm('gift:send', [user, amount], 'sendGift', () => ({
      userId: user.read().trim(), amount: amount.read(),
    }), '/api/gifts');
    return card([heading('sendGift'), p('giftHelp'), p('feeUnknown'), form]);
  }

  gameForm() {
    const game = field('games', 'slots', { type: 'select', items: ['slots', 'wheel', 'oddEven', 'dice'].map((id) => ({ id, label: t(id) })) });
    const amount = numeric('amount', 1, 1);
    const choice = field('choice', 'odd', {
      type: 'select', items: ['odd', 'even', '1', '2', '3', '4', '5', '6'].map((id) => ({ id, label: t(id) })),
    });
    const action = this.actionForm('game:play', [game, amount, choice], 'playGame', () => {
      const type = game.read();
      const selected = choice.read();
      if ((type === 'oddEven' && !['odd', 'even'].includes(selected))
        || (type === 'dice' && !integer(selected, 1, 6))) throw new Error(t('invalid'));
      return { amount: amount.read(), choice: ['slots', 'wheel'].includes(type) ? null : selected };
    }, () => `/api/games/${game.read()}`, 'playConfirm');
    return card([heading('play'), p('gameHelp'), action]);
  }

  actionForm(id, fields, label, read, path, title = label) {
    const form = element('form', { class: 'or-form' }, fields.map((item) => item.node));
    const saved = this.client.draft(id);
    if (saved?.values) {
      fields.forEach(({ input }, index) => { input.value = saved.values[index] ?? input.value; });
      this.markDirty(id, true);
    }
    const submit = button(label, () => {}, '', { type: 'submit' });
    const result = element('div', { role: 'status' });
    form.append(submit, result);
    const remember = () => {
      this.markDirty(id, true);
      try {
        this.client.draft(id, { values: fields.map(({ input }) => input.value) });
      } catch (error) { this.error(error); }
    };
    form.addEventListener('input', remember);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || this.busy) return;
      try {
        const body = read();
        if (body.userId && !/^\d{15,20}$/.test(body.userId)) throw new Error(t('invalid'));
        const response = await this.mutate(id, typeof path === 'function' ? path() : path, body, {
          title,
          preview: [
            p('danger'),
            pairs(Object.entries(body).map(([key, value]) => [key, t(String(value))])),
          ],
        });
        if (response) {
          result.replaceChildren(heading('result', 3), resultView(response));
          if (await this.refreshMember()) {
            this.content.querySelector('.or-metrics')?.replaceWith(this.metrics());
          }
        }
      } catch (error) { if (!error.status) this.error(error); }
    });
    return form;
  }

  xpAdjust() {
    const user = field('userId', '', { required: true, maxlength: 20 });
    const amount = numeric('amount', 1, 1);
    const operation = field('operation', 'add', {
      type: 'select', items: ['add', 'remove'].map((id) => ({ id, label: t(id) })),
    });
    const reason = field('reason', '', { type: 'textarea', maxlength: 500, required: true });
    return card([p('danger'), this.actionForm('xp:adjust', [user, amount, operation, reason], 'adjust', () => ({
      userId: user.read().trim(),
      amount: amount.read(),
      operation: operation.read(),
      reason: reason.read().trim(),
    }), '/api/xp/adjust')]);
  }

  async settingsPage(section) {
    const needsRoles = ['access', 'nickname', 'games', 'raffle'].includes(section);
    const [response, roles, jobs] = await Promise.all([
      section === 'raffle' && !can(this.me, 'raffle.manage')
        ? { sections: {} } : this.client.request('/api/settings'),
      needsRoles ? this.getRoles() : [],
      section === 'nickname' ? this.jobPanel() : null,
    ]);
    const record = response.sections?.[section];
    if (!record && !(section === 'raffle' && can(this.me, 'raffle.execute'))) return card([p('forbidden')]);
    const view = element('div');
    if (record && (section !== 'raffle' || can(this.me, 'raffle.manage'))) {
      const builders = {
        access: (value) => this.accessFields(value, roles),
        games: (value) => Dashboard.gameFields(value, roles),
      };
      view.append(this.settingEditor(section, record, builders[section] || ((value) => (
        this.simpleFields(section, value, roles)
      ))));
    }
    if (jobs) view.append(jobs);
    if (section === 'raffle' && can(this.me, 'raffle.execute')) {
      view.append(this.raffleForm(roles, record?.value));
    }
    return view;
  }

  settingEditor(section, record, build, {
    id = `setting:${section}`, path = `/api/settings/${section}`, method = 'PUT', product = false,
  } = {}) {
    const saved = this.client.draft(id);
    let version = saved?.version ?? record.version;
    let baselineVersion = record.version;
    let initial = clone(record.value);
    let current = clone(saved?.value || initial);
    const body = element('div');
    const state = element('p', { class: 'or-muted', role: 'status' });
    const validation = element('p', { class: 'or-validation', role: 'status' });
    const latestArea = element('div');
    const form = element('form', { class: 'or-form' });
    const save = button('save', () => {}, '', { type: 'submit', disabled: true });
    let editor;
    let valid = false;
    let restored = false;
    let hasEdits = !!saved;
    const refresh = (persist = true) => {
      try {
        current = editor.read();
        editor.validate?.(current);
        valid = form.checkValidity();
        validation.textContent = t(valid ? 'valid' : 'invalid');
        validation.classList.remove('or-error');
      } catch (error) {
        valid = false;
        let key = section === 'games' ? 'invalidGame' : 'invalid';
        if (['invalid', 'invalidProduct', 'invalidGame', 'gamePrecision', 'missingRoleHelp']
          .includes(error.message)) key = error.message;
        validation.textContent = t(key);
        validation.classList.add('or-error');
      }
      const changed = canonical(current) !== canonical(initial) || (!valid && hasEdits);
      this.markDirty(id, changed);
      state.textContent = t(changed ? 'dirty' : 'unchanged');
      save.disabled = !changed || !valid || this.busy;
      if (persist) {
        try {
          this.client.draft(id, { version, value: current, rawValues: formValues(body) });
        } catch (error) {
          save.disabled = true;
          this.error(error);
        }
      }
    };
    const rebuild = () => {
      editor = build(clone(current));
      body.replaceChildren(...editor.nodes);
      if (!restored && saved?.rawValues) {
        restoreValues(body, saved.rawValues);
        editor.update?.();
        restored = true;
      }
      refresh(false);
    };
    rebuild();
    const discard = button('discard', async () => {
      if (!(await confirmAction('discard', p('dirty')))) return;
      this.client.clearDraft(id);
      version = baselineVersion;
      current = clone(initial);
      restored = true;
      hasEdits = false;
      rebuild();
    }, 'or-secondary');
    form.append(body, validation, state, element('div', { class: 'or-actions' }, [save, discard]), latestArea);
    form.addEventListener('input', () => { restored = true; hasEdits = true; refresh(); });
    form.addEventListener('change', () => { restored = true; hasEdits = true; refresh(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      refresh();
      if (!valid || !form.reportValidity() || this.busy || save.disabled) return;
      save.disabled = true;
      try {
        const request = product ? { product: current, version } : { version, patch: current };
        const result = await this.mutate(id, path, request, {
          method,
          keyed: product,
          title: section === 'access' || section === 'lifecycle' ? 'danger' : 'save',
          preview: [p(section === 'access' ? 'accessHelp' : 'danger'), details(current)],
        });
        if (result) {
          this.client.clearDraft(id);
          this.success('saved');
          await this.render();
        }
      } catch (error) {
        if (error.status === 409) {
          const compare = button('reloadLatest', async () => {
            compare.disabled = true;
            try {
              const latestPath = product
                ? `/api/shop?manage=true&productId=${encodeURIComponent(record.value.id)}`
                : '/api/settings';
              const latestResponse = await this.client.request(latestPath);
              const items = latestResponse.items || [];
              const latest = product
                ? items.find(({ id: productId }) => productId === record.value.id)
                : latestResponse.sections?.[section];
              if (!latest) throw new Error(t('error'));
              const latestValue = product ? latest : latest.value;
              latestArea.replaceChildren(
                heading('latest', 3),
                details(latestValue),
                p('rebaseHelp'),
                element('div', { class: 'or-actions' }, [
                  button('useLatest', async () => {
                    if (!(await confirmAction('useLatest', p('dirty')))) return;
                    this.client.forget(id);
                    version = latest.version;
                    baselineVersion = latest.version;
                    initial = clone(latestValue);
                    current = clone(latestValue);
                    hasEdits = false;
                    this.client.clearDraft(id);
                    rebuild();
                    latestArea.replaceChildren();
                    this.renderPending();
                  }, 'or-secondary'),
                  button('rebase', async () => {
                    if (!(await confirmAction('rebase', [p('rebaseHelp'), details(current)]))) return;
                    this.client.forget(id);
                    version = latest.version;
                    baselineVersion = latest.version;
                    initial = clone(latestValue);
                    refresh();
                    latestArea.replaceChildren();
                    this.renderPending();
                  }),
                ]),
              );
            } catch (latestError) { this.error(latestError); } finally { compare.disabled = false; }
          }, 'or-secondary');
          latestArea.replaceChildren(p('stale'), compare);
        }
      } finally {
        if (form.isConnected) refresh(false);
      }
    });
    if (saved && canonical(saved.value) !== canonical(initial)) {
      this.success('restoreDraft');
      this.markDirty(id, true);
    }
    return card([form]);
  }

  simpleFields(section, value, roles) {
    let fields = [];
    let help = `${section}Help`;
    if (section === 'attendance') fields = [numeric('rewardXp', value.rewardXp)];
    if (section === 'lifecycle') fields = [toggle('resetOnLeave', value.resetOnLeave)];
    if (section === 'gift') {
      fields = [toggle('enabled', value.enabled), numeric('feePercent', value.feePercent, 0, 100, 0.01)];
    }
    if (section === 'shop') fields = [toggle('enabled', value.enabled)];
    if (section === 'nickname') {
      fields = [
        toggle('enabled', value.enabled), field('template', value.template, { maxlength: 32, required: true }),
        roleField('excludedRoleIds', value.excludedRoleIds, roles, { multiple: true }),
      ];
    }
    if (section === 'raffle') {
      help = 'raffleHelp';
      fields = [
        numeric('maxWinners', value.maxWinners, 1, 50),
        numeric('maxAmountXp', value.maxAmountXp, 1, 1000000),
        numeric('maxTotalXp', value.maxTotalXp, 1, 50000000),
        numeric('previewTtlSeconds', value.previewTtlSeconds, 1, 900),
      ];
    }
    const preview = element('div', { class: 'or-preview' });
    const updatePreview = () => {
      if (section === 'nickname') {
        const name = `${fields[1].read().replaceAll('{레벨}', number(this.me.profile?.level))} ${this.me.user.displayName}`;
        preview.replaceChildren(heading('nicknamePreview', 3), element('p', { text: name }));
      }
      if (section === 'gift') {
        const fee = Math.floor(Math.round(fields[1].read() * 100) / 100);
        preview.replaceChildren(pairs([['amount', `100 ${t('xpUnit')}`], ['fee', fee], ['recipientGets', 100 - fee]]));
      }
    };
    fields.forEach(({ input }) => input.addEventListener('input', updatePreview));
    updatePreview();
    return {
      nodes: [p(help), ...fields.map((item) => item.node), preview],
      read: () => ({
        ...value,
        ...Object.fromEntries(fields.map((item) => [item.input.name, item.read()])),
      }),
      validate: (next) => {
        fields.forEach(({ input }) => {
          if (!input.checkValidity()) throw new Error('invalid');
        });
        const templateLength = [...String(next.template).replaceAll('{레벨}', '99999999')].length;
        if (section === 'nickname'
          && (next.template.split('{레벨}').length !== 2 || templateLength > 24
            || /[\r\n]/.test(next.template))) {
          throw new Error('invalid');
        }
        if (section === 'raffle' && next.maxTotalXp < next.maxAmountXp) throw new Error('invalid');
      },
    };
  }

  accessFields(value, roles) {
    const catalog = this.me.permissionCatalog || [];
    const ids = catalog.map((item) => (typeof item === 'string' ? item : item.id));
    const search = field('roleSearch', '');
    const list = element('div', { class: 'or-role-list' });
    const controls = [];
    const editableRoles = [...roles];
    Object.keys(value.adminRoles || {}).filter((id) => !roles.some((role) => role.id === id))
      .forEach((id) => editableRoles.push({ id, name: `${t('missingRole')} · ${id}`, missing: true }));
    editableRoles.forEach((role) => {
      const group = element('fieldset', { class: 'or-role-permissions' }, [
        element('legend', { text: role.name }),
        role.dangerous || role.managed || role.manageable === false ? p('accessTrust') : null,
        role.missing ? p('missingRoleHelp') : null,
      ]);
      ids.forEach((id) => {
        const checked = (value.adminRoles?.[role.id] || []).includes(id);
        const control = field(permissionLabel(id), checked, {
          type: 'checkbox', disabled: (role.missing && !checked) || id === 'access.manage',
        });
        if (id === 'access.manage') control.node.append(badge('ownerOnly'));
        group.append(control.node);
        controls.push({ roleId: role.id, permission: id, control });
      });
      group.dataset.name = role.name.toLocaleLowerCase('ko-KR');
      if (role.missing) {
        group.append(button('removeRole', async () => {
          if (!(await confirmAction('removeRole', p('missingRoleHelp')))) return;
          controls.filter(({ roleId }) => roleId === role.id)
            .forEach(({ control }) => { control.input.checked = false; });
          search.input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 'or-secondary'));
      }
      list.append(group);
    });
    search.input.addEventListener('input', () => {
      const term = search.read().toLocaleLowerCase('ko-KR');
      [...list.children].forEach((group) => { group.hidden = !group.dataset.name.includes(term); });
    });
    return {
      nodes: [p('accessHelp'), p('accessTrust'), search.node, list],
      read: () => {
        const adminRoles = clone(value.adminRoles || {});
        editableRoles.forEach(({ id }) => { delete adminRoles[id]; });
        controls.forEach(({ roleId, permission, control }) => {
          if (control.read() && permission !== 'access.manage') {
            adminRoles[roleId] ||= [];
            adminRoles[roleId].push(permission);
          }
        });
        Object.entries(adminRoles).forEach(([roleId, permissions]) => {
          const original = value.adminRoles?.[roleId] || [];
          adminRoles[roleId] = [
            ...original.filter((id) => permissions.includes(id)),
            ...permissions.filter((id) => !original.includes(id)),
          ];
        });
        return { ...value, adminRoles };
      },
      validate: (next) => {
        if (Object.entries(next.adminRoles).some(([id, permissions]) => (
          !roles.some((role) => role.id === id) && permissions.length
        ))) throw new Error('missingRoleHelp');
      },
    };
  }

  static gameFields(value, roles) {
    const editors = ['slots', 'wheel', 'oddEven', 'dice'].map((kind) => {
      const game = value[kind];
      const enabled = toggle('enabled', game.enabled);
      const mode = field('mode', game.mode, {
        type: 'select', items: [{ id: 'basic', label: t('basic') }, { id: 'advanced', label: t('advanced') }],
      });
      const target = numeric('targetRtp', game.targetRtp, 0, 100, 0.001);
      const minimum = numeric('minBetXp', game.minBetXp, 1, 1000000);
      const maximum = numeric('maxBetXp', game.maxBetXp, 1, 1000000);
      const cooldown = numeric('cooldownSeconds', game.cooldownSeconds, 0, 86400);
      const cap = numeric('maxPayoutXp', game.maxPayoutXp, 1, 1000000000);
      const allowedRoles = roleField('allowedRoleIds', game.allowedRoleIds, roles, { multiple: true });
      const channels = field('allowedChannelIds', (game.allowedChannelIds || []).join(', '));
      const outcomes = field('outcomes', JSON.stringify(game.outcomes, null, 2), { type: 'textarea', rows: 10 });
      const sample = numeric('betPreview', game.minBetXp, 1);
      const choice = field('choice', game.outcomes[0]?.id, {
        type: 'select', items: game.outcomes.map(({ id }) => ({ id, label: outcomeLabel(id) })),
      });
      const preview = element('div', { class: 'or-game-preview', 'aria-live': 'polite' });
      let acceptedMode = game.mode;
      const read = () => {
        const table = mode.read() === 'basic'
          ? basicOutcomes(game, target.read(), kind) : JSON.parse(outcomes.read());
        return {
          ...game,
          enabled: enabled.read(),
          mode: mode.read(),
          targetRtp: mode.read() === 'basic' ? target.read() : game.targetRtp,
          minBetXp: minimum.read(),
          maxBetXp: maximum.read(),
          cooldownSeconds: cooldown.read(),
          maxPayoutXp: cap.read(),
          allowedRoleIds: allowedRoles.read(),
          allowedChannelIds: channels.read().split(',').map((id) => id.trim()).filter(Boolean),
          outcomes: table,
        };
      };
      const update = () => {
        outcomes.node.hidden = mode.read() !== 'advanced';
        target.input.disabled = mode.read() !== 'basic';
        target.node.querySelector('label').textContent = t(mode.read() === 'basic' ? 'targetRtp' : 'actualRtp');
        choice.node.hidden = !['oddEven', 'dice'].includes(kind);
        try {
          const next = read();
          const calculated = gamePreview(next, sample.read(), kind, choice.read());
          if (mode.read() === 'advanced') target.input.value = calculated.theoretical;
          preview.replaceChildren(
            pairs([
              ['actualRtp', `${number(calculated.actual)}%`], ['maxLoss', number(calculated.maxLoss)],
              ['maxWin', number(calculated.maxWin)],
            ]),
            element('div', { class: 'or-table-scroll' }, [
              element('table', {}, [
                element('caption', { text: t(kind) }),
                element('thead', {}, [element('tr', {}, ['result', 'probability', 'multiplier', 'payout'].map((key) => element('th', { scope: 'col', text: t(key) })))]),
                element('tbody', {}, calculated.rows.map((row) => element('tr', {}, [
                  element('th', { scope: 'row', text: outcomeLabel(row.id) }),
                  element('td', { text: `${number(row.probability * 100)}% (${number(row.weight)}/${number(calculated.totalWeight)})` }),
                  element('td', { text: number(row.multiplierMilli / 1000) }),
                  element('td', { text: `${number(row.payout)} ${t('xpUnit')}` }),
                ]))),
              ]),
            ]),
          );
          validateGame(next, kind);
        } catch (error) {
          preview.replaceChildren(element('p', {
            class: 'or-error',
            text: t(error.message === 'gamePrecision' ? 'gamePrecision' : 'invalidGame'),
          }));
        }
      };
      mode.input.addEventListener('change', async () => {
        const requestedMode = mode.read();
        mode.input.value = acceptedMode;
        if (!(await confirmAction('mode', p('modeConfirm')))) return;
        if (requestedMode === 'advanced') {
          try {
            const table = basicOutcomes(game, target.read(), kind);
            outcomes.input.value = JSON.stringify(table, null, 2);
          } catch { return; }
        }
        acceptedMode = requestedMode;
        mode.input.value = requestedMode;
        update();
        mode.input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const controls = [
        enabled, mode, target, minimum, maximum, cooldown, cap,
        allowedRoles, channels, outcomes, sample, choice,
      ];
      const group = element('fieldset', { class: 'or-game-fields' }, [
        element('legend', { text: t(kind) }), ...controls.map((item) => item.node), preview,
      ]);
      group.addEventListener('input', update);
      group.addEventListener('change', update);
      update();
      return {
        kind, node: group, read, update,
      };
    });
    return {
      nodes: [p('gameHelp'), ...editors.map(({ node }) => node)],
      update: () => editors.forEach((editor) => editor.update()),
      read: () => Object.fromEntries(editors.map(({ kind, read }) => [kind, read()])),
      validate: (next) => Object.entries(next).forEach(([kind, game]) => {
        validateGame(game, kind);
        if (game.allowedChannelIds.length > 100 || game.allowedRoleIds.length > 100
          || game.allowedChannelIds.some((id) => !/^\d{15,20}$/.test(id))
          || new Set(game.allowedChannelIds).size !== game.allowedChannelIds.length) {
          throw new Error('invalid');
        }
      }),
    };
  }

  async jobPanel() {
    const data = await this.client.request('/api/jobs');
    let after;
    const count = element('p', { role: 'status' });
    let next;
    const enqueue = async () => {
      try {
        const result = await this.mutate(`jobs:sync:${after || 'first'}`, '/api/jobs/sync', after ? { after } : {}, {
          title: 'sync', preview: p('syncHelp'), keyed: false,
        });
        if (result) {
          after = result.nextCursor;
          next.hidden = !after || result.scheduled;
          this.client.draft('jobs:cursor', { after, scheduled: result.scheduled });
          count.textContent = `${t('queued')} · ${number(result.queued)}${result.scheduled ? ` · ${t('syncScheduled')}` : ''}`;
          return true;
        }
      } catch { /* The batch can be explicitly retried from the pending panel. */ }
      return false;
    };
    next = button('syncNext', enqueue, 'or-secondary', { hidden: true });
    const savedCursor = this.client.draft('jobs:cursor');
    after = savedCursor?.after;
    next.hidden = !after || savedCursor?.scheduled;
    const list = element('div');
    (data.items || []).forEach((job) => {
      const total = Number(job.total) || 0;
      const done = Number(job.completed) || 0;
      list.append(card([
        pairs([
          ['id', job.id], ['userId', job.userId],
          ['status', translatedStatus(job.status || job.state)], ['completed', job.completed ?? 0],
          ['failed', job.failed ?? 0], ['queued', job.queued ?? 0], ['attempts', job.attempts ?? 0],
          ['reason', job.error || job.reason || job.errorCode || '—'],
        ]),
        total ? element('progress', { max: total, value: done, 'aria-label': t('progress') }) : null,
      ]));
    });
    if (!list.children.length) list.append(p('empty'));
    const counts = data.counts || {};
    const total = Object.values(counts).reduce((sum, value) => sum + Number(value), 0);
    const done = Number(counts.completed || counts.complete || 0) + Number(counts.failed || 0);
    const panel = card([
      heading('jobs'), p('syncHelp'),
      data.sweep?.active ? p('syncScheduled') : null,
      pairs(Object.entries(data.counts || {}).map(([state, countValue]) => [
        translatedStatus(state), number(countValue),
      ])),
      button('sync', async () => {
        const previous = after;
        after = undefined;
        if (!(await enqueue())) after = previous;
      }), next, count, list,
      button('refresh', () => this.render(), 'or-secondary'),
    ]);
    if (total) panel.append(element('progress', { max: total, value: done, 'aria-label': t('progress') }));
    this.appendMore(panel, data, '/api/jobs', (items) => {
      items.forEach((job) => list.append(card([pairs([
        ['id', job.id], ['userId', job.userId],
        ['status', translatedStatus(job.status || job.state)],
        ['attempts', job.attempts || 0], ['errorCode', job.errorCode || '—'],
      ])])));
    });
    return panel;
  }

  raffleForm(roles, limits = {}) {
    const role = roleField('targetRole', '', roles, { all: true });
    // Raffle targeting does not grant roles, so higher/managed roles may be selected.
    [...role.input.options].forEach((option) => { option.disabled = false; });
    const winners = numeric('winners', 1, 1, limits.maxWinners || 50);
    const amount = numeric('raffleAmount', Math.min(100, limits.maxAmountXp || 100), 1, limits.maxAmountXp || 1000000);
    const form = element('form', { class: 'or-form' }, [role.node, winners.node, amount.node]);
    const result = element('div');
    const previewButton = button('previewRaffle', () => {}, '', { type: 'submit' });
    let snapshot;
    let snapshotBody;
    const read = () => ({
      ...(role.read() ? { roleId: role.read() } : {}),
      winners: winners.read(),
      amount: amount.read(),
    });
    const execute = button('executeRaffle', async () => {
      if (!snapshot || canonical(read()) !== snapshotBody) return;
      if (snapshot.expiresAt && new Date(snapshot.expiresAt).getTime() <= Date.now()) {
        result.replaceChildren(p('expiredPreview'));
        return;
      }
      try {
        const response = await this.mutate(`raffle:${snapshot.previewId}`, '/api/raffles', {
          previewId: snapshot.previewId,
        }, {
          title: 'executeRaffle', preview: [p('danger'), details(snapshot)], draftId: 'raffle:preview',
        });
        if (response) {
          snapshot = null;
          execute.disabled = true;
          result.replaceChildren(heading('result', 3), resultView(response));
        }
      } catch { /* A retry always refers to the same candidate snapshot. */ }
    }, 'or-danger', { disabled: true });
    form.addEventListener('input', () => {
      snapshot = null;
      execute.disabled = true;
      result.replaceChildren();
      this.markDirty('raffle:preview', true);
      try {
        this.client.draft('raffle:preview', read());
      } catch (error) { this.error(error); }
    });
    const draft = this.client.draft('raffle:preview');
    if (draft) {
      role.input.value = draft.roleId || '';
      winners.input.value = draft.winners;
      amount.input.value = draft.amount;
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      previewButton.disabled = true;
      try {
        const body = read();
        if (limits.maxTotalXp && body.winners * body.amount > limits.maxTotalXp) {
          throw new Error(t('invalid'));
        }
        snapshot = await this.client.request('/api/raffles/preview', { method: 'POST', body });
        snapshotBody = canonical(body);
        result.replaceChildren(heading('snapshot', 3), pairs([
          ['candidateCount', snapshot.candidateCount], ['winners', snapshot.winners ?? body.winners],
          ['totalXp', snapshot.totalXp ?? body.winners * body.amount], ['previewExpires', date(snapshot.expiresAt)],
        ]));
        execute.disabled = false;
      } catch (error) { this.error(error); } finally { previewButton.disabled = false; }
    });
    form.append(previewButton, result, execute);
    return card([heading('raffle'), p('raffleHelp'), form]);
  }

  async products() {
    const [data, roles, settings] = await Promise.all([
      this.client.request('/api/shop?manage=true'), this.getRoles(), this.client.request('/api/settings'),
    ]);
    const view = element('div');
    const editorArea = element('div');
    const open = async (product, restoring = false) => {
      if (!restoring && this.dirty && !(await confirmAction('dirty', p('leaveConfirm')))) return;
      const value = product || {
        title: '', description: '', roleId: '', priceXp: 1, sortOrder: 0, enabled: false,
      };
      const id = `product:${product?.id || 'new'}`;
      this.client.draft('products:editor', { id: product?.id || 'new' });
      const editor = this.settingEditor('products', { version: product?.version ?? 0, value }, (draft) => (
        Dashboard.productFields(draft, product, roles)
      ), {
        id,
        path: product ? `/api/products/${encodeURIComponent(product.id)}` : '/api/products',
        method: product ? 'PUT' : 'POST',
        product: true,
      });
      editorArea.replaceChildren(heading(product ? 'editProduct' : 'addProduct'), editor);
      editorArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const list = element('div', { class: 'or-grid' });
    const append = (items) => items.forEach((product) => list.append(card([
      element('h2', { text: product.title }), pairs([
        ['price', `${number(product.priceXp)} ${t('xpUnit')}`],
        ['productVersion', product.version], ['role', product.roleId],
      ]), product.roleLocked ? badge('roleLocked') : null,
      button('edit', () => open(product), 'or-secondary'),
    ])));
    append(data.items || []);
    if (!list.children.length) list.append(p('empty'));
    if (settings.sections?.shop) {
      view.append(this.settingEditor('shop', settings.sections.shop, (value) => (
        this.simpleFields('shop', value, roles)
      )));
    }
    view.append(button('addProduct', () => open()), list, editorArea);
    this.appendMore(view, data, '/api/shop?manage=true', append, 'after');
    const savedEditor = this.client.draft('products:editor');
    if (savedEditor) {
      const saved = this.client.draft(`product:${savedEditor.id}`);
      if (saved) {
        const product = (data.items || []).find(({ id }) => id === savedEditor.id);
        await open(savedEditor.id === 'new' ? null : product || saved.value, true);
      }
    }
    return view;
  }

  static productFields(value, original, roles) {
    const title = field('title', value.title, { required: true, maxlength: 100 });
    const description = field('description', value.description, { type: 'textarea', maxlength: 4096, rows: 6 });
    const role = roleField('role', value.roleId, roles, {
      locked: original?.roleLocked, restricted: true,
    });
    const price = numeric('price', value.priceXp, 1, 1000000000);
    const sort = numeric('sortOrder', value.sortOrder, -1000000, 1000000);
    const enabled = toggle('enabled', value.enabled);
    const fields = [title, description, role, price, sort, enabled];
    const preview = element('div', { class: 'or-preview-grid' });
    const read = () => ({
      title: title.read().trim(),
      description: description.read(),
      roleId: role.read(),
      priceXp: price.read(),
      sortOrder: sort.read(),
      enabled: enabled.read(),
    });
    const update = () => {
      const product = read();
      const roleName = roles.find(({ id }) => id === product.roleId)?.name || product.roleId || '—';
      preview.replaceChildren(
        card([
          heading('discordPreview', 3), heading('selectPreview', 4),
          element('div', { class: 'or-select-preview' }, [
            element('strong', { text: product.title || t('title') }),
            element('p', { text: shortDescription(product.description) }),
          ]),
          heading('embedPreview', 4),
          element('div', { class: 'or-embed-preview' }, [
            element('strong', { text: product.title || t('title') }),
            element('p', { class: 'or-description', text: product.description }),
            pairs([['price', `${number(product.priceXp)} ${t('xpUnit')}`], ['role', roleName]]),
          ]),
        ]),
        card([
          heading('webPreview', 3), element('h4', { text: product.title || t('title') }),
          element('p', { class: 'or-description', text: product.description }),
          element('strong', { class: 'or-price', text: `${number(product.priceXp)} ${t('xpUnit')}` }),
          element('span', { text: roleName }),
        ]),
      );
    };
    fields.forEach(({ input }) => input.addEventListener('input', update));
    update();
    return {
      nodes: [
        p('unsafeRole'), ...fields.map((item) => item.node),
        original?.roleLocked ? p('roleLocked') : null, preview,
      ].filter(Boolean),
      read,
      validate: (product) => {
        if (!validateProduct(product, original, roles)) throw new Error('invalidProduct');
      },
    };
  }
}

function permissionLabel(id) {
  const labels = {
    'attendance.manage': 'attendance',
    'lifecycle.manage': 'lifecycle',
    'access.manage': 'access',
    'gift.manage': 'gift',
    'nickname.manage': 'nickname',
    'games.manage': 'games',
    'raffle.manage': 'raffle',
    'raffle.execute': 'executeRaffle',
    'xp.adjust': 'xp',
    'shop.manage': 'products',
    'orders.manage': 'orders',
    'admin.view': 'summary',
    'audit.view': 'audit',
  };
  return labels[id] || id;
}

function outcomeLabel(id) {
  const labels = {
    lose: 'lose', pair: 'pair', triple: 'triple', blank: 'blank', one: 'one', two: 'two', eight: 'eight',
  };
  return t(labels[id] || id);
}

function translatedStatus(status) {
  const map = {
    pending: 'pending',
    queued: 'queued',
    complete: 'completed',
    completed: 'completed',
    failed: 'failed',
    retrying: 'retrying',
    refunded: 'refunded',
    refund_forfeited: 'refundForfeited',
    review: 'needsReview',
    needs_review: 'needsReview',
    processing: 'pending',
  };
  return status ? t(map[status] || 'unknown') : undefined;
}

export function levelForXp(xp) {
  return Math.floor(Math.sqrt((3 * Math.floor(Math.max(0, Number(xp))) + 4) / 100));
}

export async function mountDashboard(widget, { client } = {}) {
  document.title = t('brand');
  let root = widget.querySelector('.off-record-root');
  if (!root) {
    root = element('div', { class: 'off-record-root' });
    widget.replaceChildren(root);
  }
  let connection = client;
  try { connection ||= new OffRecordClient({ origin: API_ORIGIN }); } catch {
    root.replaceChildren(card([heading('setupTitle', 1), p('configInvalid')], 'or-state'));
    return null;
  }
  const app = new Dashboard(root, connection);
  await app.initialize();
  return app;
}
