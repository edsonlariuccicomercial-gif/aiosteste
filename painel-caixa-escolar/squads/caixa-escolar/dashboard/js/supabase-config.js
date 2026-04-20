/**
 * supabase-config.js — Single source of truth for Supabase connection (Story 7.5)
 * Load this script BEFORE any other JS that accesses Supabase.
 * The anon key is safe to expose in frontend when RLS is active (Story 7.1).
 */
(function () {
  'use strict';
  window.SUPABASE_CONFIG = {
    URL: 'https://mvvsjaudhbglxttxaeop.supabase.co',
    KEY: 'sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR'
  };
  // Legacy compat: expose as globals for existing code
  window.SUPABASE_URL = window.SUPABASE_CONFIG.URL;
  window.SUPABASE_KEY = window.SUPABASE_CONFIG.KEY;
})();
