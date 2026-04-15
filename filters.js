'use strict';

/* ════════════════════════════════════════════
   FILTERS
════════════════════════════════════════════ */
const Filters = {
  onFunnelChange() {
    State.setStages([]);
    Utils.el('stage-all').checked = true;
    document.querySelectorAll('#stage-list input').forEach(cb => { cb.checked = false; });
    this._updateStageBtn();
    this.apply();
  },

  apply() {
    const selStages   = State.getStages();
    const selStatuses = State.getStatuses();
    const selRatings  = State.getRatings();
    const selMonths = State.getMonths();
    const selYears  = State.getYears();

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

      // Verifica se passa pelo filtro de mês/ano (período principal)
      const passesMonthYear = (() => {
        if (selMonths.length === 0 && selYears.length === 0) return true;
        if (!cd) return false;
        if (selMonths.length > 0 && !selMonths.includes(cd.getMonth() + 1)) return false;
        if (selYears.length  > 0 && !selYears.includes(cd.getFullYear()))   return false;
        return true;
      })();

      if (!passesMonthYear) return false;

      // Stage
      if (selStages.length > 0 && !selStages.includes(Deal.stage(d))) return false;

      // Status (multi-select: deal passa se corresponder a pelo menos um selecionado)
      if (selStatuses.length > 0) {
        const ok = selStatuses.some(s =>
          s === 'won'       ? Deal.isWon(d) :
          s === 'lost'      ? Deal.isLost(d) :
          s === 'open'      ? (Deal.isOpen(d) && !Deal.isPaused(d)) :
          s === 'paused'    ? Deal.isPaused(d) :
          s === 'not-paused'? !Deal.isPaused(d) : false
        );
        if (!ok) return false;
      }

      // Sellers
      if (sellers.length > 0 && !sellers.includes(Deal.seller(d))) return false;

      // Rating
      if (selRatings.length > 0 && !selRatings.includes(String(d.rating))) return false;

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

    // Rebuild stage checkbox list
    const allStages = [...new Set(State.getRaw().deals.map(Deal.stage).filter(Boolean))];
    const stages = allowedStages
      ? allStages.filter(s => funnel === 'carteira' ? s.includes('Carteira') : s.includes('Funil'))
      : allStages;
    this._buildStageList(stages);

    // Rebuild seller list
    const allSellers = [...new Set(State.getRaw().deals.map(Deal.seller).filter(Boolean))].sort();
    this._buildSellerList(allSellers);

    // Show/hide clear button
    Utils.el('btn-clear-filters').style.display = isActive ? 'inline-flex' : 'none';

    Renderer.renderAll();
  },

  _isActive() {
    return State.getMonths().length   > 0
      || State.getYears().length    > 0
      || Utils.el('f-funnel').value !== 'ambos'
      || State.getStages().length   > 0
      || State.getStatuses().length > 0
      || State.getRatings().length  > 0
      || State.getSellers().length  > 0;
  },

  clear() {
    State.setMonths([]);
    State.setYears([2026]);
    Utils.el('month-all').checked  = true;
    Utils.el('year-all').checked   = false;
    document.querySelectorAll('#month-list input').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#year-list input').forEach(cb => { cb.checked = cb.value === '2026'; });
    this._updateMonthBtn();
    this._updateYearBtn();
    Utils.el('f-funnel').value = 'ambos';
    State.setStages([]);
    Utils.el('stage-all').checked = true;
    document.querySelectorAll('#stage-list input').forEach(cb => { cb.checked = false; });
    this._updateStageBtn();
    State.setStatuses([]);
    Utils.el('status-all').checked = true;
    document.querySelectorAll('#status-list input').forEach(cb => { cb.checked = false; });
    this._updateStatusBtn();
    State.setRatings([]);
    Utils.el('rating-all').checked = true;
    document.querySelectorAll('#rating-list input').forEach(cb => { cb.checked = false; });
    this._updateRatingBtn();
    State.setSellers([]);
    Utils.el('seller-all').checked = true;
    document.querySelectorAll('#seller-list input').forEach(cb => { cb.checked = false; });
    this._updateSellerBtn();
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

  toggleRatingMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-rating-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },

  onRatingAll() {
    State.setRatings([]);
    document.querySelectorAll('#rating-list input').forEach(cb => { cb.checked = false; });
    Utils.el('rating-all').checked = true;
    this._updateRatingBtn();
    this.apply();
  },

  onRatingCheck() {
    const sel = [];
    document.querySelectorAll('#rating-list input:checked').forEach(cb => sel.push(cb.value));
    State.setRatings(sel);
    Utils.el('rating-all').checked = sel.length === 0;
    this._updateRatingBtn();
    this.apply();
  },

  _updateRatingBtn() {
    const sel = State.getRatings();
    const stars = { '1':'★','2':'★★','3':'★★★','4':'★★★★','5':'★★★★★' };
    Utils.setText('f-rating-btn', sel.length === 0 ? 'Qualquer Estrela' : sel.map(s => stars[s]).join(', '));
  },

  toggleStatusMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-status-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },

  onStatusAll() {
    State.setStatuses([]);
    document.querySelectorAll('#status-list input').forEach(cb => { cb.checked = false; });
    Utils.el('status-all').checked = true;
    this._updateStatusBtn();
    this.apply();
  },

  onStatusCheck() {
    const sel = [];
    document.querySelectorAll('#status-list input:checked').forEach(cb => sel.push(cb.value));
    State.setStatuses(sel);
    Utils.el('status-all').checked = sel.length === 0;
    this._updateStatusBtn();
    this.apply();
  },

  _updateStatusBtn() {
    const labels = { open: 'Em Andamento', won: 'Vendidos', lost: 'Perdidos', paused: 'Pausado', 'not-paused': 'Não Pausado' };
    const sel = State.getStatuses();
    Utils.setText('f-status-btn', sel.length === 0 ? 'Todos os Status' : sel.map(s => labels[s] || s).join(', '));
  },

  toggleStageMenu(e) {
    e.stopPropagation();
    const m = Utils.el('f-stage-menu');
    m.style.display = m.style.display === 'none' ? '' : 'none';
  },

  onStageAll() {
    State.setStages([]);
    document.querySelectorAll('#stage-list input').forEach(cb => { cb.checked = false; });
    Utils.el('stage-all').checked = true;
    this._updateStageBtn();
    this.apply();
  },

  onStageCheck() {
    const sel = [];
    document.querySelectorAll('#stage-list input:checked').forEach(cb => sel.push(cb.value));
    State.setStages(sel);
    Utils.el('stage-all').checked = sel.length === 0;
    this._updateStageBtn();
    this.apply();
  },

  _updateStageBtn() {
    const n = State.getStages().length;
    Utils.setText('f-stage-btn', n === 0 ? 'Todas as Etapas' : `${n} etapa(s)`);
  },

  _buildStageList(stages) {
    const cur = State.getStages();
    // Remove stages from list that no longer exist, keep valid selections
    const valid = cur.filter(s => stages.includes(s));
    if (valid.length !== cur.length) State.setStages(valid);

    Utils.el('stage-list').innerHTML = stages.map(s =>
      `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${Utils.esc(s)}"${valid.includes(s) ? ' checked' : ''} onchange="Filters.onStageCheck()"> ${Utils.esc(s)}
      </label>`
    ).join('');
    this._updateStageBtn();
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
  [
    ['f-seller-menu','f-seller-btn'],
    ['f-month-menu','f-month-btn'],
    ['f-year-menu','f-year-btn'],
    ['f-rating-menu','f-rating-btn'],
    ['f-status-menu','f-status-btn'],
    ['f-stage-menu','f-stage-btn'],
    ['cmp-f-rating-menu','cmp-f-rating-btn'],
    ['cmp-f-stage-menu','cmp-f-stage-btn'],
    ['cmp-f-status-menu','cmp-f-status-btn'],
    ['cmp-f-seller-menu','cmp-f-seller-btn'],
  ].forEach(([mid, bid]) => {
    const m = Utils.el(mid), b = Utils.el(bid);
    if (m && b && !m.contains(e.target) && e.target !== b) m.style.display = 'none';
  });
});
