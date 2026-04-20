/**
 * supabase-auth.js — Authentication module using Supabase Auth (Story 7.2)
 * Replaces the legacy client-side SHA-256 hash authentication.
 *
 * Depends on: supabase-config.js (must be loaded first)
 *
 * Usage:
 *   await window.gdpAuth.requireSession(); // redirects to login if not authenticated
 *   window.gdpAuth.onAuthChange(callback);  // listen for auth state changes
 *   await window.gdpAuth.signOut();         // logout
 */
(function () {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL;
  var SUPABASE_KEY = window.SUPABASE_KEY;
  var LOGIN_PAGE = '/squads/caixa-escolar/dashboard/login.html';
  var DASHBOARD_PAGE = '/squads/caixa-escolar/dashboard/gdp-contratos.html';

  // Supabase GoTrue REST endpoints
  var AUTH_URL = SUPABASE_URL + '/auth/v1';
  var HEADERS = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };

  // Session storage
  var SESSION_KEY = 'gdp.auth.session';

  function getStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (_) { return null; }
  }

  function storeSession(session) {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  function isSessionValid(session) {
    if (!session || !session.access_token || !session.expires_at) return false;
    return (session.expires_at * 1000) > Date.now();
  }

  async function refreshSession(session) {
    if (!session || !session.refresh_token) return null;
    try {
      var resp = await fetch(AUTH_URL + '/token?grant_type=refresh_token', {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!resp.ok) return null;
      var data = await resp.json();
      var newSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
        user: data.user
      };
      storeSession(newSession);
      return newSession;
    } catch (_) { return null; }
  }

  async function getSession() {
    var session = getStoredSession();
    if (isSessionValid(session)) return session;
    // Try refresh
    if (session && session.refresh_token) {
      var refreshed = await refreshSession(session);
      if (refreshed) return refreshed;
    }
    return null;
  }

  async function signIn(email, password) {
    var resp = await fetch(AUTH_URL + '/token?grant_type=password', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ email: email, password: password })
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function () { return {}; });
      throw new Error(err.error_description || err.msg || 'Credenciais inválidas');
    }
    var data = await resp.json();
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
      user: data.user
    };
    storeSession(session);
    _notifyListeners(session);
    return session;
  }

  async function signOut() {
    var session = getStoredSession();
    if (session && session.access_token) {
      fetch(AUTH_URL + '/logout', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { Authorization: 'Bearer ' + session.access_token })
      }).catch(function () {});
    }
    storeSession(null);
    _notifyListeners(null);
    window.location.href = LOGIN_PAGE;
  }

  async function requireSession() {
    var session = await getSession();
    if (!session) {
      // Skip redirect if already on login page
      if (window.location.pathname.indexOf('login') >= 0) return null;
      window.location.href = LOGIN_PAGE;
      return null;
    }
    return session;
  }

  function getAccessToken() {
    var session = getStoredSession();
    return session ? session.access_token : null;
  }

  // Auth state listeners
  var _listeners = [];

  function onAuthChange(callback) {
    _listeners.push(callback);
  }

  function _notifyListeners(session) {
    _listeners.forEach(function (fn) {
      try { fn(session); } catch (_) {}
    });
  }

  // Auto-refresh token before expiry
  setInterval(async function () {
    var session = getStoredSession();
    if (!session) return;
    var expiresIn = (session.expires_at * 1000) - Date.now();
    // Refresh 5 minutes before expiry
    if (expiresIn < 300000 && expiresIn > 0) {
      await refreshSession(session);
    }
  }, 60000);

  // Public API
  window.gdpAuth = {
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getAccessToken: getAccessToken,
    requireSession: requireSession,
    onAuthChange: onAuthChange,
    LOGIN_PAGE: LOGIN_PAGE,
    DASHBOARD_PAGE: DASHBOARD_PAGE
  };

  console.log('[gdp-auth] module loaded');
})();
