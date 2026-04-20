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

  function verify(user, pass) {
    return user === 'igoal' && pass === 'igoal2026';
  }

  return {
    login() {
      if (Date.now() < lockedUntil) return;

      const user = Utils.el('login-user').value.trim();
      const pass = Utils.el('login-pass').value;

      if (verify(user, pass)) {
        sessionStorage.setItem(CONFIG.SESSION_KEY, '1');
        sessionStorage.setItem(CONFIG.TOKEN_KEY, CONFIG.API_TOKEN);
        Utils.el('login-screen').style.display = 'none';
        Dashboard.init();
      } else {
        attempts++;
        Utils.el('login-pass').value = '';
        Utils.el('login-pass').focus();

        if (attempts >= CONFIG.LOGIN_MAX_ATTEMPTS) {
          lockedUntil = Date.now() + CONFIG.LOGIN_LOCKOUT_MS;
          startLockoutCountdown();
        } else {
          Utils.show('login-err');
        }
      }
    },

    check() {
      if (sessionStorage.getItem(CONFIG.SESSION_KEY) === '1') {
        Utils.el('login-screen').style.display = 'none';
        return true;
      }
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
