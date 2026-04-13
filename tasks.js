'use strict';

/* ════════════════════════════════════════════
   TASKS PANEL
════════════════════════════════════════════ */
const Tasks = (() => {
  let _sellers = [];
  let _selMonths = [];
  let _selYears  = [];
  let _builtSellers = false;

  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function _allTasks() {
    return State.getRaw().tasks || [];
  }

  function _taskSeller(t) {
    return (t.users && t.users.length > 0 && t.users[0].name)
      || (t.user && t.user.name)
      || t.responsible_name || '';
  }

  function _taskStatus(t) {
    if (t.done || t.status === 'done' || t.status === 'completed') return 'done';
    const due = t.due_date || t.date;
    if (due && new Date(due) < new Date(new Date().toDateString())) return 'overdue';
    return 'pending';
  }

  function _taskType(t) {
    const map = { call:'Ligação', email:'E-mail', meeting:'Reunião', task:'Tarefa', visit:'Visita', whatsapp:'WhatsApp' };
    return map[(t.type || '').toLowerCase()] || t.type || 'Tarefa';
  }

  function _statusBadge(s) {
    if (s === 'done')    return '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Concluída</span>';
    if (s === 'overdue') return '<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Atrasada</span>';
    return '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">Pendente</span>';
  }

  function _formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('pt-BR');
  }

  // Sellers come from both tasks AND deals so the list is always populated
  function _buildSellerList() {
    const all = _allTasks();
    const taskSellers = all.map(_taskSeller);
    const dealSellers = State.getRaw().deals.map(Deal.seller);
    const sellers = [...new Set([...taskSellers, ...dealSellers].filter(Boolean))].sort();
    const list = Utils.el('tasks-seller-list');
    if (!list) return;
    list.innerHTML = sellers.map(s =>
      `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:12px;cursor:pointer">
        <input type="checkbox" value="${s}" onchange="Tasks.onSellerCheck()"> ${s}
      </label>`
    ).join('');
    _builtSellers = true;
  }

  function _updateMonthBtn() {
    Utils.setText('tasks-f-month-btn', _selMonths.length === 0 ? 'Todos os Meses' : _selMonths.map(m => MONTHS_PT[m-1]).join(', '));
  }
  function _updateYearBtn() {
    Utils.setText('tasks-f-year-btn', _selYears.length === 0 ? 'Todos os Anos' : _selYears.join(', '));
  }

  function _filtered() {
    const status = Utils.el('tasks-f-status').value;
    return _allTasks().filter(t => {
      if (status !== 'all' && _taskStatus(t) !== status) return false;
      if (_sellers.length > 0 && !_sellers.includes(_taskSeller(t))) return false;
      const due = t.due_date || t.date;
      if (_selMonths.length > 0 || _selYears.length > 0) {
        if (!due) return false;
        const dt = new Date(due);
        if (isNaN(dt)) return false;
        if (_selMonths.length > 0 && !_selMonths.includes(dt.getMonth() + 1)) return false;
        if (_selYears.length  > 0 && !_selYears.includes(dt.getFullYear()))   return false;
      }
      return true;
    });
  }

  return {
    open() {
      Utils.show('tasks-overlay');
      Utils.el('tasks-panel').classList.add('open');
      if (!_builtSellers) _buildSellerList();
      this.render();
      document.addEventListener('keydown', Tasks._onKey);
    },

    close() {
      Utils.hide('tasks-overlay');
      Utils.el('tasks-panel').classList.remove('open');
      document.removeEventListener('keydown', Tasks._onKey);
    },

    _onKey(e) { if (e.key === 'Escape') Tasks.close(); },

    toggleSellerMenu(e) {
      e.stopPropagation();
      const menu = Utils.el('tasks-f-seller-menu');
      const open = menu.style.display === 'block';
      document.querySelectorAll('[id$="-menu"]').forEach(m => { m.style.display = 'none'; });
      menu.style.display = open ? 'none' : 'block';
    },

    toggleMonthMenu(e) {
      e.stopPropagation();
      const menu = Utils.el('tasks-f-month-menu');
      const open = menu.style.display === 'block';
      document.querySelectorAll('[id$="-menu"]').forEach(m => { m.style.display = 'none'; });
      menu.style.display = open ? 'none' : 'block';
    },

    toggleYearMenu(e) {
      e.stopPropagation();
      const menu = Utils.el('tasks-f-year-menu');
      const open = menu.style.display === 'block';
      document.querySelectorAll('[id$="-menu"]').forEach(m => { m.style.display = 'none'; });
      menu.style.display = open ? 'none' : 'block';
    },

    onMonthAll() {
      _selMonths = [];
      document.querySelectorAll('#tasks-month-list input').forEach(cb => { cb.checked = false; });
      Utils.el('tasks-month-all').checked = true;
      _updateMonthBtn();
      this.render();
    },

    onMonthCheck() {
      _selMonths = [];
      document.querySelectorAll('#tasks-month-list input:checked').forEach(cb => _selMonths.push(+cb.value));
      Utils.el('tasks-month-all').checked = _selMonths.length === 0;
      if (_selMonths.length === 0) Utils.el('tasks-month-all').checked = true;
      _updateMonthBtn();
      this.render();
    },

    onYearAll() {
      _selYears = [];
      document.querySelectorAll('#tasks-year-list input').forEach(cb => { cb.checked = false; });
      Utils.el('tasks-year-all').checked = true;
      _updateYearBtn();
      this.render();
    },

    onYearCheck() {
      _selYears = [];
      document.querySelectorAll('#tasks-year-list input:checked').forEach(cb => _selYears.push(+cb.value));
      Utils.el('tasks-year-all').checked = _selYears.length === 0;
      if (_selYears.length === 0) Utils.el('tasks-year-all').checked = true;
      _updateYearBtn();
      this.render();
    },

    onSellerAll() {
      _sellers = [];
      document.querySelectorAll('#tasks-seller-list input').forEach(cb => { cb.checked = Utils.el('tasks-seller-all').checked; });
      Utils.setText('tasks-f-seller-btn', 'Todos os Responsáveis');
      this.render();
    },

    onSellerCheck() {
      _sellers = [];
      document.querySelectorAll('#tasks-seller-list input:checked').forEach(cb => _sellers.push(cb.value));
      Utils.el('tasks-seller-all').checked = _sellers.length === 0;
      Utils.setText('tasks-f-seller-btn', _sellers.length === 0 ? 'Todos os Responsáveis' : `${_sellers.length} responsável(is)`);
      this.render();
    },

    clearFilters() {
      _sellers   = [];
      _selMonths = [];
      _selYears  = [];
      Utils.el('tasks-f-status').value = 'all';
      Utils.el('tasks-seller-all').checked = true;
      document.querySelectorAll('#tasks-seller-list input').forEach(cb => { cb.checked = false; });
      Utils.el('tasks-month-all').checked = true;
      document.querySelectorAll('#tasks-month-list input').forEach(cb => { cb.checked = false; });
      Utils.el('tasks-year-all').checked = true;
      document.querySelectorAll('#tasks-year-list input').forEach(cb => { cb.checked = false; });
      Utils.setText('tasks-f-seller-btn', 'Todos os Responsáveis');
      _updateMonthBtn();
      _updateYearBtn();
      this.render();
    },

    rebuildSellers() {
      _builtSellers = false;
      _buildSellerList();
      const total = _allTasks().length;
      if (total > 0) Utils.setText('tasks-nav-count', `(${total})`);
    },

    render() {
      const tasks = _filtered();
      const body  = Utils.el('tasks-body');

      const total = _allTasks().length;
      Utils.setText('tasks-count-badge', `${tasks.length} tarefa${tasks.length !== 1 ? 's' : ''}`);
      Utils.setText('tasks-nav-count', `(${total})`);

      if (tasks.length === 0) {
        Utils.hide('tasks-table-wrap');
        Utils.show('tasks-empty');
      } else {
        Utils.hide('tasks-empty');
        Utils.show('tasks-table-wrap');
        body.innerHTML = tasks.map(t => {
          const status = _taskStatus(t);
          const deal   = (t.deal && (t.deal.name || t.deal.title)) || t.deal_name || '—';
          return `<tr>
            <td>${t.subject || t.name || t.title || '—'}</td>
            <td>${_taskType(t)}</td>
            <td>${deal}</td>
            <td>${_taskSeller(t) || '—'}</td>
            <td>${_formatDate(t.due_date || t.date)}</td>
            <td>${_statusBadge(status)}</td>
          </tr>`;
        }).join('');
      }

      const active = Utils.el('tasks-f-status').value !== 'all'
        || _sellers.length > 0
        || _selMonths.length > 0
        || _selYears.length  > 0;
      Utils.el('tasks-btn-clear').style.display = active ? 'inline-flex' : 'none';
    },
  };
})();
