'use strict';

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
  isWon:    (d) => d.win === true || d.win === 1,
  isLost:   (d) => !!(d.closed_at && !Deal.isWon(d)),
  isPaused: (d) => d.hold === true,
  isOpen:   (d) => !Deal.isWon(d) && !Deal.isLost(d),
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
  stats.convRate = stats.total > 0 ? (stats.wonCount / stats.total * 100) : 0;
  stats.avgTicket = stats.wonCount > 0 ? stats.wonRevenue / stats.wonCount : 0;

  return stats;
}
