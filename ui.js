'use strict';

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
