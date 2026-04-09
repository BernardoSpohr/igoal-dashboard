'use strict';

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const CONFIG = Object.freeze({
  PROXY_BASE: 'https://script.google.com/macros/s/AKfycbwR3d0FY9IqEQr_sIRvOB8beircEz7vXNk1cDYE5QwoFZmgAUQf5mJ7yA3nsd3SL-hd/exec',
  // API_TOKEN is shared with the Apps Script doGet() validator.
  // Rotate this value together with the Apps Script token when credentials change.
  API_TOKEN: 'igoal-tk-2026',
  CACHE_KEY: 'ig_cache_v3',
  CACHE_TTL: 5 * 60 * 1000,
  AUTO_REFRESH_MS: 5 * 60 * 1000,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MS: 30 * 1000,
  CHART_COLORS: ['#1E40AF','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'],
  SESSION_KEY: 'ig_auth',
  TOKEN_KEY: 'ig_token',
});

/* ════════════════════════════════════════════
   STATE  (never accessed directly outside module)
════════════════════════════════════════════ */
const State = (() => {
  let _raw = { deals: [], tasks: [] };
  let _filtered = [];
  let _selectedSellers = [];
  let _selectedMonths = [];
  let _selectedYears = [];
  let _lineMode = 'deals';
  let _autoTimer = null;

  return {
    getRaw: () => _raw,
    getFiltered: () => _filtered,
    getSellers: () => _selectedSellers,
    getMonths: () => _selectedMonths,
    getYears: () => _selectedYears,
    getLineMode: () => _lineMode,

    setRaw: (deals, tasks) => { _raw.deals = deals; _raw.tasks = tasks; },
    setFiltered: (arr) => { _filtered = arr; },
    setSellers: (arr) => { _selectedSellers = arr; },
    setMonths: (arr) => { _selectedMonths = arr; },
    setYears: (arr) => { _selectedYears = arr; },
    setLineMode: (m) => { _lineMode = m; },

    startAutoRefresh: (fn) => {
      clearInterval(_autoTimer);
      _autoTimer = setInterval(fn, CONFIG.AUTO_REFRESH_MS);
    },
    stopAutoRefresh: () => clearInterval(_autoTimer),
  };
})();

/* ════════════════════════════════════════════
   UTILS
════════════════════════════════════════════ */
const Utils = {
  esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  // Handles both "10.000,00" (pt-BR) and "10000.00" (API) formats safely
  parseMoney(v) {
    if (!v && v !== 0) return 0;
    const str = String(v).trim();
    // pt-BR format: dots as thousand separators, comma as decimal
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
      return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return Number(str.replace(',', '.')) || 0;
  },

  fmtCurrency(n) {
    const v = Utils.parseMoney(n);
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
  },

  fmtDate(dateStr, opts = {}) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR', opts);
  },

  el(id) { return document.getElementById(id); },

  show(id, display = 'block') { const e = Utils.el(id); if (e) e.style.display = display; },
  hide(id) { const e = Utils.el(id); if (e) e.style.display = 'none'; },
  setText(id, text) { const e = Utils.el(id); if (e) e.textContent = text; },

  animateNumber(id, target) {
    const el = Utils.el(id);
    if (!el) return;
    const from = parseInt(el.textContent) || 0;
    const dur = 600;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(from + (target - from) * p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};

/* ════════════════════════════════════════════
   DEAL ACCESSORS  (normalise inconsistent API fields)
════════════════════════════════════════════ */
const Deal = {
  amount: (d) => Utils.parseMoney(d.amount_total) || Utils.parseMoney(d.amount_montly) || Utils.parseMoney(d.amount) || 0,
  stage:  (d) => (d.deal_stage && typeof d.deal_stage === 'object' ? d.deal_stage.name : d.deal_stage) || 'Sem etapa',
  source: (d) => (d.deal_source && typeof d.deal_source === 'object' ? d.deal_source.name : d.deal_source) || d.lead_source || d.source || 'Direto',
  seller: (d) => (d.user && d.user.name) || d.responsible_name || '',
  isWon:  (d) => d.win === true || d.win === 1,
  isLost: (d) => !!(d.closed_at && !Deal.isWon(d)),
  isOpen: (d) => !Deal.isWon(d) && !Deal.isLost(d),
  // Use closed_at for won deals (financial close date), fallback to created_at
  revenueDate: (d) => d.closed_at || d.created_at,
};

/* ════════════════════════════════════════════
   STATS  (single-pass over filtered array)
════════════════════════════════════════════ */
function computeStats(deals) {
  const stats = {
    total: deals.length,
    wonCount: 0, lostCount: 0, openCount: 0,
    wonRevenue: 0, openRevenue: 0,
    stageMap: {}, sourceMap: {}, sourceRevMap: {},
  };

  for (const d of deals) {
    const amt = Deal.amount(d);
    const stage = Deal.stage(d);
    const src = Deal.source(d);

    if (Deal.isWon(d)) {
      stats.wonCount++;
      stats.wonRevenue += amt;
      stats.sourceRevMap[src] = (stats.sourceRevMap[src] || 0) + amt;
    } else if (Deal.isLost(d)) {
      stats.lostCount++;
    } else {
      stats.openCount++;
      stats.openRevenue += amt;
    }

    stats.stageMap[stage] = (stats.stageMap[stage] || 0) + 1;
    stats.sourceMap[src] = (stats.sourceMap[src] || 0) + 1;
  }

  // Conversion = won / (won + lost) — excludes pipeline still in progress
  const closed = stats.wonCount + stats.lostCount;
  stats.convRate = stats.total > 0 ? (stats.wonCount / stats.total * 100) : 0;
  stats.avgTicket = stats.wonCount > 0 ? stats.wonRevenue / stats.wonCount : 0;

  return stats;
}

/* ════════════════════════════════════════════
   AUTH  (with rate limiting)
════════════════════════════════════════════ */
const Auth = (() => {
  let attempts = 0;
  let lockedUntil = 0;
  let lockTimer = null;

  function startLockoutCountdown() {
    const btn = Utils.el('btn-login');
    Utils.hide('login-err');
    Utils.show('login-lockout');
    btn.disabled = true;

    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        Utils.hide('login-lockout');
        btn.disabled = false;
        attempts = 0;
        return;
      }
      Utils.setText('lockout-timer', remaining);
      lockTimer = setTimeout(tick, 500);
    };
    tick();
  }

  function verify(user, pass) {
    // Credentials validated server-side in a real app.
    // This is intentionally a lightweight client gate for a static page.
    return user === 'igoal' && pass === 'igoal2026';
  }

  return {
    login() {
      if (Date.now() < lockedUntil) return;

      const user = Utils.el('login-user').value.trim();
      const pass = Utils.el('login-pass').value;

      if (verify(user, pass)) {
        sessionStorage.setItem(CONFIG.SESSION_KEY, '1');
        Utils.el('login-screen').style.display = 'none';
        Dashboard.init();
      } else {
        attempts++;
        Utils.el('login-pass').value = '';
        Utils.el('login-pass').focus();

        if (attempts >= CONFIG.LOGIN_MAX_ATTEMPTS) {
          lockedUntil = Date.now() + CONFIG.LOGIN_LOCKOUT_MS;
          startLockoutCountdown();
        } else {
          Utils.show('login-err');
        }
      }
    },

    check() {
      if (sessionStorage.getItem(CONFIG.SESSION_KEY) === '1') {
        Utils.el('login-screen').style.display = 'none';
        return true;
      }
      return false;
    },
  };
})();

/* ════════════════════════════════════════════
   CACHE
════════════════════════════════════════════ */
const Cache = {
  save(deals, tasks) {
    try {
      sessionStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ deals, tasks, ts: Date.now() }));
    } catch (_) {}
  },
  load() {
    try {
      const raw = sessionStorage.getItem(CONFIG.CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.ts > CONFIG.CACHE_TTL) return null;
      return c;
    } catch (_) { return null; }
  },
  clear() { sessionStorage.removeItem(CONFIG.CACHE_KEY); },
};

/* ════════════════════════════════════════════
   API
════════════════════════════════════════════ */
const API = {
  _url(endpoint) {
    const token = sessionStorage.getItem(CONFIG.TOKEN_KEY) || CONFIG.API_TOKEN;
    return `${CONFIG.PROXY_BASE}?token=${encodeURIComponent(token)}&endpoint=${encodeURIComponent(endpoint)}`;
  },

  async get(endpoint) {
    const res = await fetch(this._url(endpoint));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse((await res.text()).trim());
    if (data.error === 'Unauthorized') throw new Error('Unauthorized');
    return data;
  },

  async fetchPage(page) {
    return this.get(`deals&page=${page}&limit=200`).catch(() => ({}));
  },

  async fetchTasks() {
    return this.get('tasks').catch(() => ({}));
  },
};

/* ════════════════════════════════════════════
   DASHBOARD  (data orchestration)
════════════════════════════════════════════ */
const Dashboard = {
  async init() {
    Utils.show('loading-screen', 'flex');
    Utils.hide('error-screen');
    Utils.hide('app');
    try {
      await this._fetchAll();
    } catch (err) {
      Utils.hide('loading-screen');
      Utils.show('error-screen', 'flex');
      Utils.setText('error-msg', `Erro: ${err.message}`);
    }
  },

  async _fetchAll() {
    Utils.setText('loading-msg', 'Carregando dashboard...');
    const cached = Cache.load();

    if (cached) {
      State.setRaw(cached.deals, cached.tasks);
      this._showApp();
      this._fetchBackground();
      return;
    }

    const [page1, tasks] = await Promise.all([API.fetchPage(1), API.fetchTasks()]);
    State.setRaw(page1.deals || [], tasks.tasks || []);
    Cache.save(State.getRaw().deals, State.getRaw().tasks);
    this._showApp();
    if (page1.has_more) this._fetchRemaining(2);
  },

  async _fetchBackground() {
    try {
      const [page1, tasks] = await Promise.all([API.fetchPage(1), API.fetchTasks()]);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      if (tasks.tasks?.length) raw.tasks = tasks.tasks;
      Cache.save(raw.deals, raw.tasks);
      Filters.apply();
      if (page1.has_more) this._fetchRemaining(2);
    } catch (_) {}
  },

  async _fetchRemaining(startPage) {
    let page = startPage;
    while (page <= 20) {
      const res = await API.fetchPage(page);
      const batch = res.deals || [];
      if (!batch.length) break;
      State.getRaw().deals = State.getRaw().deals.concat(batch);
      Filters.apply();
      if (!res.has_more) break;
      page++;
    }
    UI.setStatus(true);
  },

  _showApp() {
    Utils.hide('loading-screen');
    Utils.show('app', 'flex');
    Filters.apply();
    State.startAutoRefresh(() => Dashboard.refresh());
    UI.setStatus(true);
  },

  async refresh() {
    const btn = Utils.el('ref-btn');
    btn.classList.add('spin');
    try {
      Cache.clear();
      const [page1, tasks] = await Promise.all([API.fetchPage(1), API.fetchTasks()]);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      if (tasks.tasks?.length) raw.tasks = tasks.tasks;
      Cache.save(raw.deals, raw.tasks);
      Filters.apply();
      UI.setStatus(true);
      if (page1.has_more) this._fetchRemaining(2);
    } catch (err) {
      console.error('[Dashboard.refresh]', err);
      UI.setStatus(false);
    } finally {
      btn.classList.remove('spin');
    }
  },
};

/* ════════════════════════════════════════════
   FILTERS
════════════════════════════════════════════ */
const Filters = {
  onFunnelChange() {
    Utils.el('f-stage').value = 'all';
    this.apply();
  },

  apply() {
    const stage  = Utils.el('f-stage').value;
    const status = Utils.el('f-status').value;
    const fval   = Utils.el('f-value').value;
    const rating = Utils.el('f-rating').value;
    const selMonths = State.getMonths();
    const selYears  = State.getYears();

    let vmin = null, vmax = null;
    if (fval === 'custom') {
      vmin = parseFloat(Utils.el('f-value-min').value) || 0;
      vmax = parseFloat(Utils.el('f-value-max').value) || Infinity;
    }

    const sellers = State.getSellers();
    const funnel = Utils.el('f-funnel').value;
    const allowedStages = funnel === 'oportunidades'
      ? (d) => Deal.stage(d).includes('Funil')
      : funnel === 'carteira'
        ? (d) => Deal.stage(d).includes('Carteira') || Deal.isWon(d)
        : null;

    const filtered = State.getRaw().deals.filter((d) => {
      const cd = d.created_at ? new Date(d.created_at) : null;

      // Funnel
      if (allowedStages && !allowedStages(d)) return false;

      // Period (mês/ano)
      if (selMonths.length > 0 || selYears.length > 0) {
        if (!cd) return false;
        if (selMonths.length > 0 && !selMonths.includes(cd.getMonth() + 1)) return false;
        if (selYears.length  > 0 && !selYears.includes(cd.getFullYear()))   return false;
      }

      // Stage
      if (stage !== 'all' && Deal.stage(d) !== stage) return false;

      // Status
      if (status === 'won'  && !Deal.isWon(d)) return false;
      if (status === 'lost' && !Deal.isLost(d)) return false;
      if (status === 'open' && !Deal.isOpen(d)) return false;

      // Sellers
      if (sellers.length > 0 && !sellers.includes(Deal.seller(d))) return false;

      // Rating
      if (rating !== 'all' && String(d.rating) !== rating) return false;

      // Value
      if (fval !== 'all') {
        const amt = Deal.amount(d);
        if (fval === 'custom')   { if (amt < vmin || amt > vmax) return false; }
        else if (fval === '200000+') { if (amt < 200000) return false; }
        else {
          const [lo, hi] = fval.split('-').map(Number);
          if (amt < lo || amt >= hi) return false;
        }
      }

      return true;
    });

    State.setFiltered(filtered);

    // Update period label
    const MONTHS_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const mLabel = selMonths.length > 0 ? selMonths.map(m => MONTHS_LABEL[m-1]).join(', ') : 'Todos os meses';
    const yLabel = selYears.length  > 0 ? selYears.join(', ') : 'Todos os anos';
    Utils.setText('period-display', `${mLabel} · ${yLabel}`);

    // Check active state BEFORE rebuilding dropdowns (values are still set)
    const isActive = this._isActive();

    // Rebuild stage dropdown (preserve selection)
    const stageSel = Utils.el('f-stage');
    const curStage = stageSel.value;
    const allStages = [...new Set(State.getRaw().deals.map(Deal.stage).filter(Boolean))];
    const stages = allowedStages
      ? allStages.filter(s => funnel === 'carteira' ? s.includes('Carteira') : s.includes('Funil'))
      : allStages;
    stageSel.innerHTML = '<option value="all">Todas as Etapas</option>' +
      stages.map(s => `<option value="${Utils.esc(s)}">${Utils.esc(s)}</option>`).join('');
    if (stages.includes(curStage)) stageSel.value = curStage;

    // Rebuild seller list
    const allSellers = [...new Set(State.getRaw().deals.map(Deal.seller).filter(Boolean))].sort();
    this._buildSellerList(allSellers);

    // Show/hide clear button
    Utils.el('btn-clear-filters').style.display = isActive ? 'inline-flex' : 'none';

    Renderer.renderAll();
  },

  _isActive() {
    return State.getMonths().length > 0
      || State.getYears().length  > 0
      || Utils.el('f-funnel').value  !== 'ambos'
      || Utils.el('f-stage').value   !== 'all'
      || Utils.el('f-status').value  !== 'all'
      || Utils.el('f-value').value   !== 'all'
      || Utils.el('f-rating').value  !== 'all'
      || State.getSellers().length > 0;
  },

  clear() {
    State.setMonths([]);
    State.setYears([2026]);
    Utils.el('month-all').checked = true;
    Utils.el('year-all').checked  = false;
    document.querySelectorAll('#month-list input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#year-list input').forEach(cb => { cb.checked = cb.value === '2026'; });
    this._updateMonthBtn();
    this._updateYearBtn();
    Utils.el('f-funnel').value = 'ambos';
    Utils.el('f-stage').value = 'all';
    Utils.el('f-status').value = 'all';
    Utils.el('f-value').value = 'all';
    Utils.el('f-value-min').value = '';
    Utils.el('f-value-max').value = '';
    Utils.el('f-value-min').style.display = 'none';
    Utils.el('f-value-max').style.display = 'none';
    Utils.el('f-rating').value = 'all';
    State.setSellers([]);
    Utils.el('seller-all').checked = true;
    document.querySelectorAll('#seller-list input').forEach(cb => { cb.checked = false; });
    this._updateSellerBtn();
    this.apply();
  },

  onValueChange() {
    const v = Utils.el('f-value').value;
    Utils.el('f-value-min').style.display = v === 'custom' ? '' : 'none';
    Utils.el('f-value-max').style.display = v === 'custom' ? '' : 'none';
    this.apply();
  },

  toggleSellerMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-seller-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },

  onSellerAll() {
    const checked = Utils.el('seller-all').checked;
    State.setSellers([]);
    document.querySelectorAll('#seller-list input').forEach(cb => { cb.checked = checked; });
    this._updateSellerBtn();
    this.apply();
  },

  onSellerCheck() {
    const sel = [];
    document.querySelectorAll('#seller-list input:checked').forEach(cb => sel.push(cb.value));
    State.setSellers(sel);
    Utils.el('seller-all').checked = sel.length === 0;
    this._updateSellerBtn();
    this.apply();
  },

  toggleMonthMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-month-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },
  onMonthAll() {
    const checked = Utils.el('month-all').checked;
    State.setMonths([]);
    document.querySelectorAll('#month-list input').forEach(cb => { cb.checked = checked; });
    this._updateMonthBtn();
    this.apply();
  },
  onMonthCheck() {
    const sel = [];
    document.querySelectorAll('#month-list input:checked').forEach(cb => sel.push(parseInt(cb.value)));
    State.setMonths(sel);
    Utils.el('month-all').checked = sel.length === 0;
    this._updateMonthBtn();
    this.apply();
  },
  _updateMonthBtn() {
    const n = State.getMonths().length;
    Utils.setText('f-month-btn', n === 0 ? 'Todos os Meses' : `${n} mês(es)`);
  },

  toggleYearMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-year-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },
  onYearAll() {
    const checked = Utils.el('year-all').checked;
    State.setYears([]);
    document.querySelectorAll('#year-list input').forEach(cb => { cb.checked = checked; });
    this._updateYearBtn();
    this.apply();
  },
  onYearCheck() {
    const sel = [];
    document.querySelectorAll('#year-list input:checked').forEach(cb => sel.push(parseInt(cb.value)));
    State.setYears(sel);
    Utils.el('year-all').checked = sel.length === 0;
    this._updateYearBtn();
    this.apply();
  },
  _updateYearBtn() {
    const n = State.getYears().length;
    Utils.setText('f-year-btn', n === 0 ? 'Todos os Anos' : `${n} ano(s)`);
  },

  _updateSellerBtn() {
    const n = State.getSellers().length;
    Utils.setText('f-seller-btn', n === 0 ? 'Todos os Vendedores' : `${n} vendedor(es)`);
  },

  _buildSellerList(sellers) {
    const cur = State.getSellers();
    Utils.el('seller-list').innerHTML = sellers.map(s =>
      `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${Utils.esc(s)}"${cur.includes(s) ? ' checked' : ''} onchange="Filters.onSellerCheck()"> ${Utils.esc(s)}
      </label>`
    ).join('');
  },
};

// Close menus on outside click
document.addEventListener('click', (e) => {
  [['f-seller-menu','f-seller-btn'],['f-month-menu','f-month-btn'],['f-year-menu','f-year-btn']].forEach(([mid, bid]) => {
    const m = Utils.el(mid), b = Utils.el(bid);
    if (m && b && !m.contains(e.target) && e.target !== b) m.style.display = 'none';
  });
});

/* ════════════════════════════════════════════
   CHARTS  (update in-place when possible)
════════════════════════════════════════════ */
const Charts = (() => {
  const _charts = {};

  function _upsertChart(key, ctx, config) {
    if (_charts[key]) {
      _charts[key].data = config.data;
      if (config.options) _charts[key].options = config.options;
      _charts[key].update('none'); // skip animation on update for perf
      return _charts[key];
    }
    _charts[key] = new Chart(ctx, config);
    return _charts[key];
  }

  function _gradient(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, 'rgba(37,99,235,0.13)');
    g.addColorStop(1, 'rgba(37,99,235,0)');
    return g;
  }

  const BASE_SCALES = {
    x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 11 } } },
    y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 11 } }, beginAtZero: true },
  };

  return {
    setLineMode(mode, btn) {
      State.setLineMode(mode);
      document.querySelectorAll('.pill-row .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.renderLine();
    },

    renderDonut(canvasId, key, stats) {
      const ctx = Utils.el(canvasId).getContext('2d');
      const { openCount: open, wonCount: won, lostCount: lost } = stats;
      _upsertChart(key, ctx, {
        type: 'doughnut',
        data: {
          labels: [`Abertos (${open})`, `Ganhos (${won})`, `Perdidos (${lost})`],
          datasets: [{ data: [open, won, lost], backgroundColor: ['#2563EB','#059669','#DC2626'], borderWidth: 0, hoverOffset: 5 }],
        },
        options: {
          cutout: '72%', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#374151', font: { size: 11 }, padding: 14 } } },
        },
      });
    },

    renderLine() {
      const filt = State.getFiltered();
      const selMonths = State.getMonths();
      const selYears  = State.getYears();
      const mode = State.getLineMode();
      const amtFn = mode === 'value'
        ? (arr) => arr.reduce((s, x) => s + Deal.amount(x), 0)
        : (arr) => arr.length;
      const MS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const activeYears = selYears.length > 0 ? selYears : [2021,2022,2023,2024,2025,2026];
      const labels = [], vals = [];

      if (selMonths.length === 1 && selYears.length === 1) {
        // Dias do mês/ano específico
        Utils.setText('line-sub', 'Visão diária do mês');
        const yr = selYears[0], mo = selMonths[0] - 1;
        const days = new Date(yr, mo + 1, 0).getDate();
        for (let i = 1; i <= days; i++) {
          labels.push(String(i).padStart(2,'0'));
          vals.push(amtFn(filt.filter(x => {
            if (!x.created_at) return false;
            const cd = new Date(x.created_at);
            return cd.getFullYear() === yr && cd.getMonth() === mo && cd.getDate() === i;
          })));
        }
      } else if (selYears.length === 1) {
        // Meses do ano específico
        Utils.setText('line-sub', 'Visão mensal do ano');
        const yr = selYears[0];
        for (let m = 0; m < 12; m++) {
          labels.push(MS[m]);
          vals.push(amtFn(filt.filter(x => {
            if (!x.created_at) return false;
            const cd = new Date(x.created_at);
            return cd.getFullYear() === yr && cd.getMonth() === m;
          })));
        }
      } else {
        // Por ano
        Utils.setText('line-sub', 'Visão anual');
        for (const yr of activeYears) {
          labels.push(String(yr));
          vals.push(amtFn(filt.filter(x => {
            if (!x.created_at) return false;
            return new Date(x.created_at).getFullYear() === yr;
          })));
        }
      }

      const ctx = Utils.el('lineChart').getContext('2d');

      if (_charts.line) {
        _charts.line.data.labels = labels;
        _charts.line.data.datasets[0].data = vals;
        _charts.line.update();
        return;
      }

      _charts.line = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: vals, borderColor: '#2563EB', backgroundColor: _gradient(ctx),
            fill: true, tension: 0.35, pointBackgroundColor: '#2563EB',
            pointRadius: 3, borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ...BASE_SCALES.x, ticks: { ...BASE_SCALES.x.ticks, maxTicksLimit: 12, maxRotation: 45 } },
            y: BASE_SCALES.y,
          },
        },
      });
    },

    renderRevenue(filt) {
      const selMonths = State.getMonths();
      const selYears  = State.getYears();
      const MS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const activeYears = selYears.length > 0 ? selYears : [2021,2022,2023,2024,2025,2026];
      const wonDeals = filt.filter(Deal.isWon);
      const labels = [], vals = [];

      if (selMonths.length === 1 && selYears.length === 1) {
        Utils.setText('rev-sub', 'Receita diária do mês');
        const yr = selYears[0], mo = selMonths[0] - 1;
        const days = new Date(yr, mo + 1, 0).getDate();
        for (let i = 1; i <= days; i++) {
          labels.push(String(i).padStart(2,'0'));
          vals.push(wonDeals.filter(x => {
            const rd = Deal.revenueDate(x);
            if (!rd) return false;
            const cd = new Date(rd);
            return cd.getFullYear() === yr && cd.getMonth() === mo && cd.getDate() === i;
          }).reduce((s, x) => s + Deal.amount(x), 0));
        }
      } else if (selYears.length === 1) {
        Utils.setText('rev-sub', 'Receita mensal do ano');
        const yr = selYears[0];
        for (let m = 0; m < 12; m++) {
          labels.push(MS[m]);
          vals.push(wonDeals.filter(x => {
            const rd = Deal.revenueDate(x);
            if (!rd) return false;
            const cd = new Date(rd);
            return cd.getFullYear() === yr && cd.getMonth() === m;
          }).reduce((s, x) => s + Deal.amount(x), 0));
        }
      } else {
        Utils.setText('rev-sub', 'Receita anual');
        for (const yr of activeYears) {
          labels.push(String(yr));
          vals.push(wonDeals.filter(x => {
            const rd = Deal.revenueDate(x);
            if (!rd) return false;
            return new Date(rd).getFullYear() === yr;
          }).reduce((s, x) => s + Deal.amount(x), 0));
        }
      }

      const ctx = Utils.el('revChart').getContext('2d');
      const colors = vals.map((_, i) => i === vals.length - 1 ? '#1A2B5E' : '#93C5FD');

      _upsertChart('rev', ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 5, borderSkipped: false }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` R$ ${Utils.fmtCurrency(c.parsed.y)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 11 }, maxTicksLimit: 10 } },
            y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 11 }, callback: v => 'R$' + Utils.fmtCurrency(v) }, beginAtZero: true },
          },
        },
      });
    },

    renderStage(stageMap) {
      const entries = Object.entries(stageMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const labels = entries.map(e => e[0]);
      const data   = entries.map(e => e[1]);
      const ctx    = Utils.el('stageChart').getContext('2d');

      _upsertChart('stage', ctx, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: '#2563EB', borderRadius: 4 }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 } }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { color: '#374151', font: { size: 11 } } },
          },
        },
      });
    },

    renderOriginRev(sourceRevMap) {
      const sorted = Object.entries(sourceRevMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const ctx = Utils.el('originRevChart').getContext('2d');

      _upsertChart('originRev', ctx, {
        type: 'bar',
        data: {
          labels: sorted.map(e => e[0]),
          datasets: [{ data: sorted.map(e => e[1]), backgroundColor: '#2563EB', borderRadius: 4 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` R$ ${Utils.fmtCurrency(c.parsed.y)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 10 } } },
            y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 }, callback: v => 'R$' + Utils.fmtCurrency(v) }, beginAtZero: true },
          },
        },
      });
    },
  };
})();

/* ════════════════════════════════════════════
   RENDERER  (orchestrates all render calls)
════════════════════════════════════════════ */
const Renderer = {
  renderAll() {
    const filt = State.getFiltered();
    const stats = computeStats(filt);

    this._renderKPIs(stats);
    Charts.renderDonut('donutChart',  'donut',  stats);
    Charts.renderDonut('donutChartM', 'donutM', stats);
    Charts.renderLine();
    Charts.renderRevenue(filt);
    Charts.renderStage(stats.stageMap);
    Charts.renderOriginRev(stats.sourceRevMap);
    this._renderFunnel(stats.stageMap);
    this._renderOrigins(stats.sourceMap, stats.total);
    this._renderDealsTable(filt);
  },

  _renderKPIs(stats) {
    const { total, wonCount, openCount, openRevenue, wonRevenue, convRate, avgTicket } = stats;

    Utils.animateNumber('v-leads', total);
    Utils.setText('s-leads', `${total} negócios no período`);
    UI.setDelta('d-leads', 'flat', `${total}`);

    Utils.animateNumber('v-deals', openCount);
    Utils.setText('s-deals', `R$ ${Utils.fmtCurrency(openRevenue)} em aberto`);

    Utils.animateNumber('v-won', wonCount);
    Utils.setText('s-won', `R$ ${Utils.fmtCurrency(wonRevenue)} · ticket médio R$ ${Utils.fmtCurrency(avgTicket)}`);
    UI.setDelta('d-won', wonCount > 0 ? 'up' : 'flat', wonCount > 0 ? '↑ bom' : '—');

    Utils.setText('v-conv', `${convRate.toFixed(1)}%`);
    Utils.setText('s-conv', 'ganhos ÷ total de negócios');
    UI.setDelta('d-conv', convRate >= 30 ? 'up' : convRate >= 15 ? 'flat' : 'down', `${convRate.toFixed(1)}%`);
  },

  _renderFunnel(stageMap) {
    const sorted = Object.entries(stageMap).sort((a, b) => b[1] - a[1]);
    const wrap   = Utils.el('funnel-wrap');

    if (!sorted.length) {
      wrap.innerHTML = '<div class="empty"><div class="ei">📊</div><p>Sem dados</p></div>';
      return;
    }

    const max = sorted[0][1];
    wrap.innerHTML = sorted.map(([name, count], i) => {
      const pct  = ((count / max) * 100).toFixed(0);
      const conv = i > 0 ? ((count / sorted[i - 1][1]) * 100).toFixed(0) : '100';
      const color = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
      return `<div class="funnel-step" onclick="UI.drillFunnel('${Utils.esc(name)}')" data-stage="${Utils.esc(name)}">
        <div class="f-top">
          <div class="f-name">${Utils.esc(name)}</div>
          <div class="f-meta"><span class="f-count">${count}</span><span class="f-pct">${pct}%</span></div>
        </div>
        <div class="f-bg"><div class="f-fill" style="width:${pct}%;background:${color}"></div></div>
        ${i > 0 ? `<div class="f-conv">Conversão da etapa anterior: <span>${conv}%</span></div>` : ''}
      </div>`;
    }).join('');
  },

  _renderOrigins(sourceMap, total) {
    const sorted = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const wrap   = Utils.el('origin-wrap');

    if (!sorted.length) {
      wrap.innerHTML = '<div class="empty"><div class="ei">🔍</div><p>Sem dados</p></div>';
      return;
    }

    const safeTotal = total || 1;
    wrap.innerHTML = sorted.map(([name, count]) => {
      const pct = ((count / safeTotal) * 100).toFixed(0);
      return `<div class="origin-item">
        <div class="origin-row">
          <span class="origin-name">${Utils.esc(name)}</span>
          <span class="origin-val">${count} <span style="color:#9CA3AF;font-weight:400">(${pct}%)</span></span>
        </div>
        <div class="o-bg"><div class="o-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  },

  _renderDealsTable(deals) {
    Utils.setText('tbl-count', `${deals.length} negócio${deals.length !== 1 ? 's' : ''}`);
    const tbody = Utils.el('deals-body');

    if (!deals.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="ei">💼</div><p>Nenhum negócio encontrado</p></div></td></tr>';
      return;
    }

    // Store deals array for drill-down by index (avoids encoding full JSON in DOM)
    Renderer._tableDeals = deals;

    const fragment = document.createDocumentFragment();
    const tmp = document.createElement('tbody');

    tmp.innerHTML = deals.slice(0, 200).map((d, i) => {
      const stage  = Deal.stage(d);
      const isWon  = Deal.isWon(d);
      const isLost = Deal.isLost(d);
      const lbl    = isWon ? 'Ganho' : isLost ? 'Perdido' : 'Aberto';
      const cls    = isWon ? 't-won' : isLost ? 't-lost' : 't-open';
      const dt     = Utils.fmtDate(d.created_at);
      const seller = Utils.esc(Deal.seller(d) || '—');
      return `<tr onclick="UI.drillDeal(${i})">
        <td>${Utils.esc(d.name || '—')}</td>
        <td class="td-mono">R$ ${Utils.fmtCurrency(Deal.amount(d))}</td>
        <td>${Utils.esc(stage)}</td>
        <td><span class="tag ${cls}">${lbl}</span></td>
        <td>${seller}</td>
        <td class="td-mono">${dt}</td>
      </tr>`;
    }).join('');

    while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
    tbody.replaceChildren(fragment);
  },

  _tableDeals: [],
};

/* ════════════════════════════════════════════
   UI  (modals, status, helpers)
════════════════════════════════════════════ */
const UI = {
  setDelta(id, cls, txt) {
    const el = Utils.el(id);
    if (!el) return;
    el.className = `kpi-delta ${cls}`;
    el.textContent = txt;
  },

  setStatus(ok) {
    Utils.el('s-dot').className = 'status-dot' + (ok ? '' : ' err');
    Utils.el('s-text').textContent = ok
      ? 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : 'Erro de conexão';
  },

  drillDeal(idx) {
    const d = Renderer._tableDeals[idx];
    if (!d) return;

    const isWon  = Deal.isWon(d);
    const isLost = Deal.isLost(d);
    const status = isWon ? '✅ Ganho' : isLost ? '❌ Perdido' : '🔵 Aberto';

    Utils.setText('modal-title', d.name || 'Detalhes');
    Utils.el('modal-body').innerHTML = `<div class="modal-field-grid">
      ${this._field('Nome',        Utils.esc(d.name || '—'))}
      ${this._field('Valor',       'R$ ' + Utils.fmtCurrency(Deal.amount(d)))}
      ${this._field('Status',      status)}
      ${this._field('Etapa',       Utils.esc(Deal.stage(d)))}
      ${this._field('Responsável', Utils.esc(Deal.seller(d) || '—'))}
      ${this._field('Criado em',   Utils.fmtDate(d.created_at))}
      ${this._field('Fechado em',  Utils.fmtDate(d.closed_at))}
      ${this._field('Origem',      Utils.esc(Deal.source(d)))}
      ${this._field('Ticket',      'R$ ' + Utils.fmtCurrency(Deal.amount(d)))}
      ${this._field('ID',          String(d.id || '—'))}
    </div>`;
    Utils.el('modal').classList.add('open');
  },

  drillFunnel(stage) {
    const rows = State.getFiltered().filter(d => Deal.stage(d) === stage);
    Utils.setText('modal-title', `${stage} — ${rows.length} negócios`);

    if (!rows.length) {
      Utils.el('modal-body').innerHTML = '<div class="empty"><p>Sem negócios nessa etapa</p></div>';
    } else {
      Utils.el('modal-body').innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="padding:8px;text-align:left;color:var(--text4);font-size:10px;text-transform:uppercase">Nome</th>
            <th style="padding:8px;text-align:left;color:var(--text4);font-size:10px;text-transform:uppercase">Valor</th>
            <th style="padding:8px;text-align:left;color:var(--text4);font-size:10px;text-transform:uppercase">Status</th>
          </tr></thead>
          <tbody>${rows.map(d => `
            <tr style="border-bottom:1px solid rgba(226,230,239,0.5)">
              <td style="padding:9px 8px;font-weight:600;color:var(--text)">${Utils.esc(d.name || '—')}</td>
              <td style="padding:9px 8px;font-family:monospace">R$ ${Utils.fmtCurrency(Deal.amount(d))}</td>
              <td style="padding:9px 8px">${Deal.isWon(d) ? '✅ Ganho' : Deal.isLost(d) ? '❌ Perdido' : '🔵 Aberto'}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    }

    Utils.el('modal').classList.add('open');
  },

  closeModal(e) {
    if (!e || e.target === Utils.el('modal')) {
      Utils.el('modal').classList.remove('open');
    }
  },

  _field(label, value) {
    return `<div class="modal-field">
      <div class="modal-field-label">${label}</div>
      <div class="modal-field-value">${value}</div>
    </div>`;
  },
};

/* ════════════════════════════════════════════
   COMPARISON  (side panel — compare 2 months)
════════════════════════════════════════════ */
const Comparison = (() => {
  let _lineChart = null;
  let _revChart  = null;
  const MS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  function _dealsForMonth(yr, mo) {
    return State.getRaw().deals.filter(d => {
      if (!d.created_at) return false;
      const cd = new Date(d.created_at);
      return cd.getFullYear() === yr && cd.getMonth() === mo - 1;
    });
  }

  function _dailySeries(deals, yr, mo, fn) {
    const days = new Date(yr, mo, 0).getDate();
    const out = [];
    for (let i = 1; i <= days; i++) {
      out.push(fn(deals.filter(d => new Date(d.created_at).getDate() === i)));
    }
    return out;
  }

  function _upsertCmp(key, ref, ctx, config) {
    if (ref) {
      ref.data.labels          = config.data.labels;
      ref.data.datasets[0].data  = config.data.datasets[0].data;
      ref.data.datasets[0].label = config.data.datasets[0].label;
      ref.data.datasets[1].data  = config.data.datasets[1].data;
      ref.data.datasets[1].label = config.data.datasets[1].label;
      ref.update();
      return ref;
    }
    return new Chart(ctx, config);
  }

  return {
    open() {
      Utils.el('cmp-overlay').classList.add('open');
      Utils.el('cmp-panel').classList.add('open');
      this.render();
    },

    close() {
      Utils.el('cmp-overlay').classList.remove('open');
      Utils.el('cmp-panel').classList.remove('open');
    },

    render() {
      const yrA = parseInt(Utils.el('cmp-year-a').value);
      const moA = parseInt(Utils.el('cmp-month-a').value);
      const yrB = parseInt(Utils.el('cmp-year-b').value);
      const moB = parseInt(Utils.el('cmp-month-b').value);

      const dealsA = _dealsForMonth(yrA, moA);
      const dealsB = _dealsForMonth(yrB, moB);

      const daysA = new Date(yrA, moA, 0).getDate();
      const daysB = new Date(yrB, moB, 0).getDate();
      const maxDays = Math.max(daysA, daysB);
      const labels = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, '0'));

      const volA = [], volB = [], revA = [], revB = [];
      for (let i = 1; i <= maxDays; i++) {
        const dA = i <= daysA ? dealsA.filter(d => new Date(d.created_at).getDate() === i) : [];
        const dB = i <= daysB ? dealsB.filter(d => new Date(d.created_at).getDate() === i) : [];
        volA.push(dA.length);
        volB.push(dB.length);
        revA.push(dA.filter(Deal.isWon).reduce((s, x) => s + Deal.amount(x), 0));
        revB.push(dB.filter(Deal.isWon).reduce((s, x) => s + Deal.amount(x), 0));
      }

      const lblA = `${MS[moA - 1]}/${yrA}`;
      const lblB = `${MS[moB - 1]}/${yrB}`;

      const BASE = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 }, maxTicksLimit: 16 } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 } }, beginAtZero: true },
        },
      };

      _lineChart = _upsertCmp('line', _lineChart, Utils.el('cmpLineChart').getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: lblA, data: volA, borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.07)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
            { label: lblB, data: volB, borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.07)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
          ],
        },
        options: BASE,
      });

      _revChart = _upsertCmp('rev', _revChart, Utils.el('cmpRevChart').getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: lblA, data: revA, borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.07)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
            { label: lblB, data: revB, borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.07)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
          ],
        },
        options: {
          ...BASE,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` R$ ${Utils.fmtCurrency(c.parsed.y)}` } } },
          scales: {
            ...BASE.scales,
            y: { ...BASE.scales.y, ticks: { ...BASE.scales.y.ticks, callback: v => 'R$' + Utils.fmtCurrency(v) } },
          },
        },
      });

      const sA = computeStats(dealsA);
      const sB = computeStats(dealsB);
      const kpis = [
        { label: 'Negócios',      a: sA.total,                          b: sB.total },
        { label: 'Ganhos',        a: sA.wonCount,                       b: sB.wonCount },
        { label: 'Conversão',     a: sA.convRate.toFixed(1) + '%',      b: sB.convRate.toFixed(1) + '%' },
        { label: 'Receita Ganha', a: 'R$ ' + Utils.fmtCurrency(sA.wonRevenue), b: 'R$ ' + Utils.fmtCurrency(sB.wonRevenue) },
      ];
      Utils.el('cmp-kpis').innerHTML = kpis.map(k => `
        <div class="cmp-kpi">
          <div class="cmp-kpi-label">${k.label}</div>
          <div class="cmp-kpi-vals">
            <div class="cmp-kpi-val a"><div class="cmp-kpi-num">${k.a}</div><div class="cmp-kpi-sublbl">${lblA}</div></div>
            <div class="cmp-kpi-val b"><div class="cmp-kpi-num">${k.b}</div><div class="cmp-kpi-sublbl">${lblB}</div></div>
          </div>
        </div>`).join('');
    },
  };
})();

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

  // Pré-seleciona 2026
  State.setYears([2026]);
  const cb2026 = document.querySelector('#year-list input[value="2026"]');
  if (cb2026) cb2026.checked = true;
  Utils.el('year-all').checked = false;
  Filters._updateYearBtn();

  Utils.el('btn-login').addEventListener('click', () => Auth.login());
  Utils.el('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
  Utils.el('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') Utils.el('login-pass').focus(); });

  if (Auth.check()) Dashboard.init();
});
