'use strict';

/* ════════════════════════════════════════════
   COMPARISON  (full-screen — compare 2 months)
════════════════════════════════════════════ */
const Comparison = (() => {
  const _charts = {};
  let _mode = 'deals';
  let _tab  = 'a';
  let _dealsA = [], _dealsB = [];
  let _sellers = [], _cMonths = [], _cYears = [];
  const MS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const CA = '#2563EB', CB = '#7C3AED';
  const BGA = 'rgba(37,99,235,0.08)', BGB = 'rgba(124,58,237,0.08)';
  const XS = { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 }, maxTicksLimit: 16 } };
  const YS = { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 } }, beginAtZero: true };

  function _uc(key, ctx, cfg) {
    if (_charts[key]) {
      _charts[key].data = cfg.data;
      if (cfg.options) _charts[key].options = cfg.options;
      _charts[key].update('none');
      return _charts[key];
    }
    return (_charts[key] = new Chart(ctx, cfg));
  }

  function _dealsForMonth(yr, mo) {
    return State.getRaw().deals.filter(d => {
      if (!d.created_at) return false;
      const cd = new Date(d.created_at);
      return cd.getFullYear() === yr && cd.getMonth() === mo - 1;
    });
  }

  function _applyFilters(deals) {
    const funnel = Utils.el('cmp-f-funnel').value;
    const stage  = Utils.el('cmp-f-stage').value;
    const status = Utils.el('cmp-f-status').value;
    const rating = Utils.el('cmp-f-rating').value;
    const allowedStages = funnel === 'oportunidades'
      ? (d) => Deal.stage(d).includes('Funil')
      : funnel === 'carteira'
        ? (d) => Deal.stage(d).includes('Carteira') || Deal.isWon(d)
        : null;

    const useCDate = _cMonths.length > 0 || _cYears.length > 0;
    return deals.filter(d => {
      const cd = d.created_at ? new Date(d.created_at) : null;
      if (allowedStages && !allowedStages(d)) return false;

      if (useCDate) {
        const passesCDate = Deal.isOpen(d) && (() => {
          if (!cd) return false;
          if (_cMonths.length > 0 && !_cMonths.includes(cd.getMonth() + 1)) return false;
          if (_cYears.length  > 0 && !_cYears.includes(cd.getFullYear()))   return false;
          return true;
        })();
        if (!passesCDate) return false;
      }

      if (stage !== 'all' && Deal.stage(d) !== stage) return false;
      if (status === 'won'        && !Deal.isWon(d))                        return false;
      if (status === 'lost'       && !Deal.isLost(d))                       return false;
      if (status === 'open'       && (!Deal.isOpen(d) || Deal.isPaused(d))) return false;
      if (status === 'paused'     && !Deal.isPaused(d))                     return false;
      if (status === 'not-paused' && Deal.isPaused(d))                      return false;
      if (_sellers.length > 0 && !_sellers.includes(Deal.seller(d))) return false;
      if (rating !== 'all' && String(d.rating) !== rating) return false;
      return true;
    });
  }

  function _buildSellerList(sellers) {
    Utils.el('cmp-seller-list').innerHTML = sellers.map(s =>
      `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${Utils.esc(s)}"${_sellers.includes(s) ? ' checked' : ''} onchange="Comparison.onSellerCheck()"> ${Utils.esc(s)}
      </label>`
    ).join('');
  }

  function _rebuildStageDropdown(rawA, rawB) {
    const funnel = Utils.el('cmp-f-funnel').value;
    const allDeals = rawA.concat(rawB);
    const allStages = [...new Set(allDeals.map(Deal.stage).filter(Boolean))];
    const stages = funnel === 'oportunidades' ? allStages.filter(s => s.includes('Funil'))
      : funnel === 'carteira' ? allStages.filter(s => s.includes('Carteira'))
      : allStages;
    const sel = Utils.el('cmp-f-stage');
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Todas as Etapas</option>' +
      stages.map(s => `<option value="${Utils.esc(s)}">${Utils.esc(s)}</option>`).join('');
    if (stages.includes(cur)) sel.value = cur;
  }

  function _dailySeries(deals, daysInMonth, valueFn) {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return valueFn(deals.filter(d => new Date(d.created_at).getDate() === day));
    });
  }

  function _renderKPIs(sA, sB, lblA, lblB) {
    const kpis = [
      { label: 'Negócios',      nA: sA.total,        nB: sB.total,        dA: sA.total,       dB: sB.total },
      { label: 'Vendidos',      nA: sA.wonCount,      nB: sB.wonCount,     dA: sA.wonCount,    dB: sB.wonCount },
      { label: 'Em Andamento',  nA: sA.openCount,     nB: sB.openCount,    dA: sA.openCount,   dB: sB.openCount },
      { label: 'Perdidos',      nA: sA.lostCount,     nB: sB.lostCount,    dA: sA.lostCount,   dB: sB.lostCount, inv: true },
      { label: 'Conversão',     nA: sA.convRate,      nB: sB.convRate,     dA: sA.convRate.toFixed(1) + '%',            dB: sB.convRate.toFixed(1) + '%' },
      { label: 'Receita Ganha', nA: sA.wonRevenue,    nB: sB.wonRevenue,   dA: 'R$ ' + Utils.fmtCurrency(sA.wonRevenue), dB: 'R$ ' + Utils.fmtCurrency(sB.wonRevenue) },
      { label: 'Ticket Médio',  nA: sA.avgTicket,     nB: sB.avgTicket,    dA: 'R$ ' + Utils.fmtCurrency(sA.avgTicket),  dB: 'R$ ' + Utils.fmtCurrency(sB.avgTicket) },
      { label: 'Em Aberto R$',  nA: sA.openRevenue,   nB: sB.openRevenue,  dA: 'R$ ' + Utils.fmtCurrency(sA.openRevenue), dB: 'R$ ' + Utils.fmtCurrency(sB.openRevenue) },
    ];

    Utils.el('cmp-kpis').innerHTML = kpis.map(k => {
      const tie = k.nA === k.nB;
      const aWins = tie ? false : k.inv ? k.nA < k.nB : k.nA > k.nB;
      const bWins = tie ? false : k.inv ? k.nB < k.nA : k.nB > k.nA;
      const arrowA = tie ? '' : aWins ? ' <span style="color:var(--success);font-size:14px">↑</span>' : ' <span style="color:var(--danger);font-size:14px">↓</span>';
      const arrowB = tie ? '' : bWins ? ' <span style="color:var(--success);font-size:14px">↑</span>' : ' <span style="color:var(--danger);font-size:14px">↓</span>';
      return `<div class="cmp-kpi">
        <div class="cmp-kpi-label">${k.label}</div>
        <div class="cmp-kpi-vals">
          <div class="cmp-kpi-val a"><div class="cmp-kpi-num">${k.dA}${arrowA}</div><div class="cmp-kpi-sublbl">${lblA}</div></div>
          <div class="cmp-kpi-val b"><div class="cmp-kpi-num">${k.dB}${arrowB}</div><div class="cmp-kpi-sublbl">${lblB}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  function _renderLine(dealsA, dealsB, daysA, daysB, lblA, lblB) {
    const maxDays = Math.max(daysA, daysB);
    const labels  = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, '0'));
    const amtFn   = _mode === 'value' ? arr => arr.reduce((s, x) => s + Deal.amount(x), 0) : arr => arr.length;
    const vA = _dailySeries(dealsA, daysA, amtFn).concat(Array(maxDays - daysA).fill(null));
    const vB = _dailySeries(dealsB, daysB, amtFn).concat(Array(maxDays - daysB).fill(null));
    const isVal = _mode === 'value';
    _uc('line', Utils.el('cmpLineChart').getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [
        { label: lblA, data: vA, borderColor: CA, backgroundColor: BGA, fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
        { label: lblB, data: vB, borderColor: CB, backgroundColor: BGB, fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#374151', font: { size: 11 }, padding: 14 } },
          tooltip: isVal ? { callbacks: { label: c => ` R$ ${Utils.fmtCurrency(c.parsed.y)}` } } : {},
        },
        scales: {
          x: XS,
          y: isVal ? { ...YS, ticks: { ...YS.ticks, callback: v => 'R$' + Utils.fmtCurrency(v) } } : YS,
        },
      },
    });
  }

  function _renderRev(dealsA, dealsB, daysA, daysB, lblA, lblB) {
    const maxDays = Math.max(daysA, daysB);
    const labels  = Array.from({ length: maxDays }, (_, i) => String(i + 1).padStart(2, '0'));
    const revFn   = arr => arr.filter(Deal.isWon).reduce((s, x) => s + Deal.amount(x), 0);
    const vA = _dailySeries(dealsA, daysA, revFn).concat(Array(maxDays - daysA).fill(null));
    const vB = _dailySeries(dealsB, daysB, revFn).concat(Array(maxDays - daysB).fill(null));
    _uc('rev', Utils.el('cmpRevChart').getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [
        { label: lblA, data: vA, borderColor: CA, backgroundColor: BGA, fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
        { label: lblB, data: vB, borderColor: CB, backgroundColor: BGB, fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` R$ ${Utils.fmtCurrency(c.parsed.y)}` } } },
        scales: { x: XS, y: { ...YS, ticks: { ...YS.ticks, callback: v => 'R$' + Utils.fmtCurrency(v) } } },
      },
    });
  }

  function _renderDonut(key, canvasId, stats) {
    const { openCount: o, wonCount: w, lostCount: l } = stats;
    _uc(key, Utils.el(canvasId).getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [`Abertos (${o})`, `Ganhos (${w})`, `Perdidos (${l})`],
        datasets: [{ data: [o, w, l], backgroundColor: ['#2563EB','#059669','#DC2626'], borderWidth: 0, hoverOffset: 5 }],
      },
      options: {
        cutout: '72%', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#374151', font: { size: 11 }, padding: 14 } } },
      },
    });
  }

  function _renderStage(key, canvasId, stageMap, color) {
    const entries = Object.entries(stageMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    _uc(key, Utils.el(canvasId).getContext('2d'), {
      type: 'bar',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: color, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#9CA3AF', font: { size: 10 } }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: '#374151', font: { size: 11 } } },
        },
      },
    });
  }

  function _renderFunnel(wrapId, stageMap) {
    const sorted = Object.entries(stageMap).sort((a, b) => b[1] - a[1]);
    const wrap = Utils.el(wrapId);
    if (!sorted.length) { wrap.innerHTML = '<div class="empty"><div class="ei">📊</div><p>Sem dados</p></div>'; return; }
    const max = sorted[0][1];
    wrap.innerHTML = sorted.map(([name, count], i) => {
      const pct   = ((count / max) * 100).toFixed(0);
      const conv  = i > 0 ? ((count / sorted[i - 1][1]) * 100).toFixed(0) : '100';
      const color = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
      return `<div class="funnel-step">
        <div class="f-top"><div class="f-name">${Utils.esc(name)}</div>
        <div class="f-meta"><span class="f-count">${count}</span><span class="f-pct">${pct}%</span></div></div>
        <div class="f-bg"><div class="f-fill" style="width:${pct}%;background:${color}"></div></div>
        ${i > 0 ? `<div class="f-conv">Conversão da etapa anterior: <span>${conv}%</span></div>` : ''}
      </div>`;
    }).join('');
  }

  function _renderOrigins(wrapId, sourceMap, total) {
    const sorted = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const wrap = Utils.el(wrapId);
    if (!sorted.length) { wrap.innerHTML = '<div class="empty"><div class="ei">🔍</div><p>Sem dados</p></div>'; return; }
    const safe = total || 1;
    wrap.innerHTML = sorted.map(([name, count]) => {
      const pct = ((count / safe) * 100).toFixed(0);
      return `<div class="origin-item">
        <div class="origin-row"><span class="origin-name">${Utils.esc(name)}</span>
        <span class="origin-val">${count} <span style="color:#9CA3AF;font-weight:400">(${pct}%)</span></span></div>
        <div class="o-bg"><div class="o-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  function _renderTable(deals) {
    const tbody = Utils.el('cmp-deals-body');
    if (!deals.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="ei">💼</div><p>Nenhum negócio encontrado</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = deals.slice(0, 200).map(d => {
      const isWon = Deal.isWon(d), isLost = Deal.isLost(d);
      const lbl = isWon ? 'Vendido' : isLost ? 'Perdido' : Deal.isPaused(d) ? 'Pausado' : 'Em Andamento';
      const cls = isWon ? 't-won'   : isLost ? 't-lost'  : Deal.isPaused(d) ? 't-paused' : 't-open';
      return `<tr>
        <td>${Utils.esc(d.name || '—')}</td>
        <td class="td-mono">R$ ${Utils.fmtCurrency(Deal.amount(d))}</td>
        <td>${Utils.esc(Deal.stage(d))}</td>
        <td><span class="tag ${cls}">${lbl}</span></td>
        <td>${Utils.esc(Deal.seller(d) || '—')}</td>
        <td class="td-mono">${Utils.fmtDate(d.created_at)}</td>
      </tr>`;
    }).join('');
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

    setMode(mode, btn) {
      _mode = mode;
      document.querySelectorAll('#cmp-pill-vol,#cmp-pill-val').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.render();
    },

    switchTab(tab) {
      _tab = tab;
      Utils.el('cmp-tab-a').classList.toggle('active', tab === 'a');
      Utils.el('cmp-tab-b').classList.toggle('active', tab === 'b');
      _renderTable(tab === 'a' ? _dealsA : _dealsB);
    },

    toggleCMonthMenu(e) {
      e.stopPropagation();
      const m = Utils.el('cmp-f-cmonth-menu');
      m.style.display = m.style.display === 'none' ? '' : 'none';
    },
    _resetCDate() {
      _cMonths = []; _cYears = [];
      Utils.el('cmp-cmonth-all').checked = true;
      Utils.el('cmp-cyear-all').checked  = true;
      document.querySelectorAll('#cmp-cmonth-list input').forEach(cb => { cb.checked = false; });
      document.querySelectorAll('#cmp-cyear-list input').forEach(cb => { cb.checked = false; });
      Utils.setText('cmp-f-cmonth-btn', 'Todos os Meses');
      Utils.setText('cmp-f-cyear-btn', 'Todos os Anos');
    },
    onCMonthAll() {
      this._resetCDate();
      this.render();
    },
    onCMonthCheck() {
      _cMonths = [];
      document.querySelectorAll('#cmp-cmonth-list input:checked').forEach(cb => _cMonths.push(parseInt(cb.value)));
      Utils.el('cmp-cmonth-all').checked = _cMonths.length === 0;
      Utils.setText('cmp-f-cmonth-btn', _cMonths.length === 0 ? 'Todos os Meses' : `${_cMonths.length} mês(es)`);
      this.render();
    },

    toggleCYearMenu(e) {
      e.stopPropagation();
      const m = Utils.el('cmp-f-cyear-menu');
      m.style.display = m.style.display === 'none' ? '' : 'none';
    },
    onCYearAll() {
      this._resetCDate();
      this.render();
    },
    onCYearCheck() {
      _cYears = [];
      document.querySelectorAll('#cmp-cyear-list input:checked').forEach(cb => _cYears.push(parseInt(cb.value)));
      Utils.el('cmp-cyear-all').checked = _cYears.length === 0;
      Utils.setText('cmp-f-cyear-btn', _cYears.length === 0 ? 'Todos os Anos' : `${_cYears.length} ano(s)`);
      this.render();
    },

    clearFilters() {
      _cMonths = []; _cYears = [];
      Utils.el('cmp-cmonth-all').checked = true;
      Utils.el('cmp-cyear-all').checked  = true;
      document.querySelectorAll('#cmp-cmonth-list input').forEach(cb => { cb.checked = false; });
      document.querySelectorAll('#cmp-cyear-list input').forEach(cb => { cb.checked = false; });
      Utils.setText('cmp-f-cmonth-btn', 'Todos os Meses');
      Utils.setText('cmp-f-cyear-btn', 'Todos os Anos');
      Utils.el('cmp-f-funnel').value = 'ambos';
      Utils.el('cmp-f-stage').value  = 'all';
      Utils.el('cmp-f-status').value = 'all';
      Utils.el('cmp-f-rating').value = 'all';
      _sellers = [];
      Utils.el('cmp-seller-all').checked = true;
      document.querySelectorAll('#cmp-seller-list input').forEach(cb => { cb.checked = false; });
      Utils.setText('cmp-f-seller-btn', 'Todos os Vendedores');
      this.render();
    },

    onFunnelChange() {
      Utils.el('cmp-f-stage').value = 'all';
      this.render();
    },

    toggleSellerMenu(e) {
      e.stopPropagation();
      const m = Utils.el('cmp-f-seller-menu');
      m.style.display = m.style.display === 'none' ? '' : 'none';
    },

    onSellerAll() {
      _sellers = [];
      document.querySelectorAll('#cmp-seller-list input').forEach(cb => { cb.checked = Utils.el('cmp-seller-all').checked; });
      Utils.setText('cmp-f-seller-btn', 'Todos os Vendedores');
      this.render();
    },

    onSellerCheck() {
      _sellers = [];
      document.querySelectorAll('#cmp-seller-list input:checked').forEach(cb => _sellers.push(cb.value));
      Utils.el('cmp-seller-all').checked = _sellers.length === 0;
      Utils.setText('cmp-f-seller-btn', _sellers.length === 0 ? 'Todos os Vendedores' : `${_sellers.length} vendedor(es)`);
      this.render();
    },

    render() {
      const yrA = parseInt(Utils.el('cmp-year-a').value);
      const moA = parseInt(Utils.el('cmp-month-a').value);
      const yrB = parseInt(Utils.el('cmp-year-b').value);
      const moB = parseInt(Utils.el('cmp-month-b').value);

      const rawA = _dealsForMonth(yrA, moA);
      const rawB = _dealsForMonth(yrB, moB);

      _rebuildStageDropdown(rawA, rawB);

      const allSellers = [...new Set(rawA.concat(rawB).map(Deal.seller).filter(Boolean))].sort();
      _buildSellerList(allSellers);

      _dealsA = _applyFilters(rawA);
      _dealsB = _applyFilters(rawB);

      const daysA = new Date(yrA, moA, 0).getDate();
      const daysB = new Date(yrB, moB, 0).getDate();
      const sA = computeStats(_dealsA);
      const sB = computeStats(_dealsB);
      const lblA = `${MS[moA - 1]}/${yrA}`;
      const lblB = `${MS[moB - 1]}/${yrB}`;

      Utils.setText('cmp-donut-a-title',  lblA);
      Utils.setText('cmp-donut-b-title',  lblB);
      Utils.setText('cmp-funnel-a-title', `Funil — ${lblA}`);
      Utils.setText('cmp-funnel-b-title', `Funil — ${lblB}`);
      Utils.setText('cmp-stage-a-title',  `Etapas — ${lblA}`);
      Utils.setText('cmp-stage-b-title',  `Etapas — ${lblB}`);
      Utils.setText('cmp-origin-a-title', `Origens — ${lblA}`);
      Utils.setText('cmp-origin-b-title', `Origens — ${lblB}`);
      Utils.setText('cmp-tab-a-count', `(${_dealsA.length})`);
      Utils.setText('cmp-tab-b-count', `(${_dealsB.length})`);

      _renderKPIs(sA, sB, lblA, lblB);
      _renderLine(_dealsA, _dealsB, daysA, daysB, lblA, lblB);
      _renderRev(_dealsA, _dealsB, daysA, daysB, lblA, lblB);
      _renderDonut('donutA', 'cmpDonutA', sA);
      _renderDonut('donutB', 'cmpDonutB', sB);
      _renderStage('stageA', 'cmpStageA', sA.stageMap, CA);
      _renderStage('stageB', 'cmpStageB', sB.stageMap, CB);
      _renderFunnel('cmp-funnel-a', sA.stageMap);
      _renderFunnel('cmp-funnel-b', sB.stageMap);
      _renderOrigins('cmp-origin-a', sA.sourceMap, sA.total);
      _renderOrigins('cmp-origin-b', sB.sourceMap, sB.total);
      _renderTable(_tab === 'a' ? _dealsA : _dealsB);

      const active = _cMonths.length > 0
        || _cYears.length > 0
        || Utils.el('cmp-f-funnel').value !== 'ambos'
        || Utils.el('cmp-f-stage').value  !== 'all'
        || Utils.el('cmp-f-status').value !== 'all'
        || Utils.el('cmp-f-rating').value !== 'all'
        || _sellers.length > 0;
      Utils.el('cmp-btn-clear').style.display = active ? 'inline-flex' : 'none';
    },
  };
})();
