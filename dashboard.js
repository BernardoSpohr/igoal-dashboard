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

    // Show app as soon as first page of deals is ready — don't wait for tasks
    const page1 = await API.fetchPage(1);
    State.setRaw(page1.deals || [], []);
    this._showApp();
    if (page1.has_more) this._fetchRemaining(2);
    // Fetch tasks in background after UI is visible
    this._fetchTasksBackground();
  },

  async _fetchBackground() {
    try {
      const page1 = await API.fetchPage(1);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      Cache.save(raw.deals, raw.tasks);
      Filters.apply();
      if (page1.has_more) this._fetchRemaining(2);
      this._fetchTasksBackground();
    } catch (_) {}
  },

  async _fetchTasksBackground() {
    try {
      const tasks = await API.fetchTasks();
      if (tasks.tasks?.length) {
        State.getRaw().tasks = tasks.tasks;
        Cache.save(State.getRaw().deals, tasks.tasks);
        Tasks.rebuildSellers();
      }
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
      Cache.save(raw.deals, raw.tasks);
      Filters.apply();
      UI.setStatus(true);
      if (page1.has_more) this._fetchRemaining(2);
      this._fetchTasksBackground();
    } catch (err) {
      console.error('[Dashboard.refresh]', err);
      UI.setStatus(false);
    } finally {
      btn.classList.remove('spin');
    }
  },
};
