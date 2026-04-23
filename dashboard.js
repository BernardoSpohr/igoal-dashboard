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
      // Refresh seguindo a mesma prioridade em background
      this._fetchDealsBackground();
      return;
    }

    // 1) Primeiros 200 negócios → mostra o app
    Utils.setText('loading-msg', 'Carregando negócios...');
    const page1 = await API.fetchPage(1);
    State.setRaw(page1.deals || [], []);
    this._showApp();

    // 2) Primeiras 200 tarefas
    await this._fetchTasksPage1();

    // 3) Resto dos negócios
    if (page1.has_more) await this._fetchRemaining(2);

    // 4) Resto das tarefas
    await this._fetchTasksBackground(2);
  },

  async _fetchDealsBackground() {
    try {
      // 1) Atualiza todos os negócios primeiro
      const page1 = await API.fetchPage(1);
      const raw = State.getRaw();
      if (page1.deals?.length) raw.deals = page1.deals;
      Filters.apply();
      if (page1.has_more) await this._fetchRemaining(2);

      // 2) Depois atualiza todas as tarefas
      await this._fetchTasksPage1();
      await this._fetchTasksBackground(2);

      Cache.save(raw.deals, raw.tasks);
    } catch (_) {}
  },

  async _fetchTasksPage1() {
    const allowed = CONFIG.TASK_SELLERS;
    const _seller = (t) => (t.users?.[0]?.name || t.user?.name || t.responsible_name || '').toLowerCase();
    const _keep   = (t) => allowed.some(n => _seller(t).includes(n));
    try {
      const res = await API.get('tasks&page=1&limit=200').catch(() => ({}));
      const batch = (res.tasks || []).filter(_keep);
      State.getRaw().tasks = batch;
      Tasks.rebuildSellers();
    } catch (_) {}
  },

  async _fetchTasksBackground(startPage = 1) {
    const allowed = CONFIG.TASK_SELLERS;
    const _seller = (t) => (t.users?.[0]?.name || t.user?.name || t.responsible_name || '').toLowerCase();
    const _keep   = (t) => allowed.some(n => _seller(t).includes(n));

    try {
      let page = startPage;
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
      await this._fetchTasksPage1();
      if (page1.has_more) await this._fetchRemaining(2);
      await this._fetchTasksBackground(2);
    } catch (err) {
      console.error('[Dashboard.refresh]', err);
      UI.setStatus(false);
    } finally {
      btn.classList.remove('spin');
    }
  },
};
