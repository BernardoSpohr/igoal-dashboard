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
    Tasks.rebuildSellers();
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
      Tasks.rebuildSellers();
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
