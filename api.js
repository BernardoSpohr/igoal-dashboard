'use strict';

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
    const all = [];
    let page = 1;
    while (page <= 50) {
      const res = await this.get(`tasks&page=${page}&limit=200`).catch(() => ({}));
      const batch = res.tasks || [];
      all.push(...batch);
      if (!batch.length || !res.has_more) break;
      page++;
    }
    return { tasks: all };
  },
};
