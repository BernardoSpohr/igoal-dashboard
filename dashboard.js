'use strict';

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
      // Refresh both in parallel in background
      this._fetchDealsBackground();
      this._fetchTasksBackground();
      return;
    }

    // Show app as soon as first page of deals arrives
    const page1 = await API.fetchPage(1);
    State.setRaw(page1.deals || [], []);
    this._showApp();

    // Load remaining deal pages AND all task pages in parallel
    const dealsPromise = page1.has_more ? this._fetchRemaining(2) : Promise.resolve();
    const tasksPromise = this._fetchTasksBackground();
    await Promise.all([dealsPromise, tasksPromise]);
  },

  async _fetchDealsBackground() {
    try {
      const page1 = await API.fetchPage(1);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      Filters.apply();
      if (page1.has_more) await this._fetchRemaining(2);
      Cache.save(raw.deals, raw.tasks);
    } catch (_) {}
  },

  async _fetchTasksBackground() {
    const allowed = CONFIG.TASK_SELLERS;
    const _seller = (t) => (t.users?.[0]?.name || t.user?.name || t.responsible_name || '').toLowerCase();
    const _keep   = (t) => allowed.some(n => _seller(t).includes(n));

    try {
      let page = 1;
      while (page <= 50) {
        const res = await API.get(`tasks&page=${page}&limit=200`).catch(() => ({}));
        const batch = (res.tasks || []).filter(_keep);
        if (!batch.length && !(res.tasks?.length)) break;
        const raw = State.getRaw();
        raw.tasks = page === 1 ? batch : raw.tasks.concat(batch);
        Tasks.rebuildSellers();
        if (!res.has_more) break;
        page++;
      }
      Cache.save(State.getRaw().deals, State.getRaw().tasks);
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
    Tasks.rebuildSellers();
    UI.setStatus(true);
  },

  async refresh() {
    const btn = Utils.el('ref-btn');
    btn.classList.add('spin');
    try {
      Cache.clear();
      const page1 = await API.fetchPage(1);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      Filters.apply();
      UI.setStatus(true);
      const dealsPromise = page1.has_more ? this._fetchRemaining(2) : Promise.resolve();
      const tasksPromise = this._fetchTasksBackground();
      await Promise.all([dealsPromise, tasksPromise]);
    } catch (err) {
      console.error('[Dashboard.refresh]', err);
      UI.setStatus(false);
    } finally {
      btn.classList.remove('spin');
    }
  },
};
