'use strict';

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
