'use strict';

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

  // Tarefas: sem pré-filtro de ano (mostra todos os anos, incluindo atrasadas antigas)
  Utils.el('tasks-year-all').checked = true;

  State.setYears([2026]);
  const cb2026 = document.querySelector('#year-list input[value="2026"]');
  if (cb2026) cb2026.checked = true;
  Utils.el('year-all').checked = false;
  Filters._updateYearBtn();


  Utils.el('btn-login').addEventListener('click', () => Auth.login());
  Utils.el('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
  Utils.el('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') Utils.el('login-pass').focus(); });

  if (Auth.check()) Dashboard.init();
});
