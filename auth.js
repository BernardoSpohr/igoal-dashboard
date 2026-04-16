'use strict';

/* ════════════════════════════════════════════
   AUTH  (with rate limiting)
════════════════════════════════════════════ */
const Auth = (() => {
  let attempts = 0;
  let lockedUntil = 0;
  let lockTimer = null;

  function startLockoutCountdown() {
    const btn = Utils.el('btn-login');
    Utils.hide('login-err');
    Utils.show('login-lockout');
    btn.disabled = true;

    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        Utils.hide('login-lockout');
        btn.disabled = false;
        attempts = 0;
        return;
      }
      Utils.setText('lockout-timer', remaining);
      lockTimer = setTimeout(tick, 500);
    };
    tick();
  }

  return {
    async login() {
      if (Date.now() < lockedUntil) return;

      const user = Utils.el('login-user').value.trim();
      const pass = Utils.el('login-pass').value;
      const btn  = Utils.el('btn-login');

      btn.disabled = true;
      btn.textContent = 'Entrando...';

      try {
        const url  = `${CONFIG.PROXY_BASE}?endpoint=login&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`;
        const res  = await fetch(url);
        const data = JSON.parse((await res.text()).trim());

        if (data.success && data.token) {
          sessionStorage.setItem(CONFIG.SESSION_KEY, '1');
          sessionStorage.setItem(CONFIG.TOKEN_KEY, data.token);
          Utils.el('login-screen').style.display = 'none';
          Dashboard.init();
        } else {
          throw new Error('invalid');
        }
      } catch (_) {
        attempts++;
        Utils.el('login-pass').value = '';
        Utils.el('login-pass').focus();

        if (attempts >= CONFIG.LOGIN_MAX_ATTEMPTS) {
          lockedUntil = Date.now() + CONFIG.LOGIN_LOCKOUT_MS;
          startLockoutCountdown();
        } else {
          Utils.show('login-err');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    },

    check() {
      const hasSession = sessionStorage.getItem(CONFIG.SESSION_KEY) === '1';
      const hasToken   = !!sessionStorage.getItem(CONFIG.TOKEN_KEY);
      if (hasSession && hasToken) {
        Utils.el('login-screen').style.display = 'none';
        return true;
      }
      // Clear partial state
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      return false;
    },
  };
})();

/* ════════════════════════════════════════════
   CACHE
════════════════════════════════════════════ */
const Cache = {
  save(deals, tasks) {
    try {
      sessionStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ deals, tasks, ts: Date.now() }));
    } catch (_) {}
  },
  load() {
    try {
      const raw = sessionStorage.getItem(CONFIG.CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.ts > CONFIG.CACHE_TTL) return null;
      return c;
    } catch (_) { return null; }
  },
  clear() { sessionStorage.removeItem(CONFIG.CACHE_KEY); },
};
