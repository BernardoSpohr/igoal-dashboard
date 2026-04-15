'use strict';

/* ════════════════════════════════════════════
   STATE  (never accessed directly outside module)
════════════════════════════════════════════ */
const State = (() => {
  let _raw = { deals: [], tasks: [] };
  let _filtered = [];
  let _selectedSellers = [];
  let _selectedMonths = [];
  let _selectedYears = [];
  let _selectedStages = [];
  let _selectedStatuses = [];
  let _selectedRatings = [];
  let _lineMode = 'deals';
  let _autoTimer = null;

  return {
    getRaw: () => _raw,
    getFiltered: () => _filtered,
    getSellers: () => _selectedSellers,
    getMonths: () => _selectedMonths,
    getYears: () => _selectedYears,
    getStages: () => _selectedStages,
    getStatuses: () => _selectedStatuses,
    getRatings: () => _selectedRatings,
    getLineMode: () => _lineMode,

    setRaw: (deals, tasks) => { _raw.deals = deals; _raw.tasks = tasks; },
    setFiltered: (arr) => { _filtered = arr; },
    setSellers: (arr) => { _selectedSellers = arr; },
    setMonths: (arr) => { _selectedMonths = arr; },
    setYears: (arr) => { _selectedYears = arr; },
    setStages: (arr) => { _selectedStages = arr; },
    setStatuses: (arr) => { _selectedStatuses = arr; },
    setRatings: (arr) => { _selectedRatings = arr; },
    setLineMode: (m) => { _lineMode = m; },

    startAutoRefresh: (fn) => {
      clearInterval(_autoTimer);
      _autoTimer = setInterval(fn, CONFIG.AUTO_REFRESH_MS);
    },
    stopAutoRefresh: () => clearInterval(_autoTimer),
  };
})();
