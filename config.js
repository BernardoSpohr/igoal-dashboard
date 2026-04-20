'use strict';

/* ════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════ */
const CONFIG = Object.freeze({
  PROXY_BASE: 'https://script.google.com/macros/s/AKfycbwR3d0FY9IqEQr_sIRvOB8beircEz7vXNk1cDYE5QwoFZmgAUQf5mJ7yA3nsd3SL-hd/exec',
  API_TOKEN: 'igoal-tk-2026',
  CACHE_KEY: 'ig_cache_v3',
  CACHE_TTL: 5 * 60 * 1000,
  AUTO_REFRESH_MS: 5 * 60 * 1000,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MS: 30 * 1000,
  TASK_SELLERS: ['alexandre', 'emanuel', 'ricardo', 'alonzo'],
  CHART_COLORS: ['#1E40AF','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'],
  SESSION_KEY: 'ig_auth',
  TOKEN_KEY: 'ig_token',
});
