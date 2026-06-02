/**
 * gdp-nav.js — Shared navigation component for GDP pages (Story 5.14)
 * Injects a consistent topbar navigation + skip link across all GDP pages.
 * Also adds a11y attributes (Story 5.11).
 *
 * Usage: include this script in any GDP page.
 * It auto-detects the current page and highlights the active link.
 */
(function () {
  'use strict';

  var NAV_ITEMS = [
    { href: 'gdp-contratos.html', label: 'Contratos', icon: '📄' },
    { href: 'gdp-dashboard.html', label: 'Dashboard', icon: '📊' },
    { href: 'gdp-gestao.html', label: 'Gestão', icon: '⚙️' },
    { href: 'gdp-portal.html', label: 'Portal Escola', icon: '🏫' },
    { href: 'gdp-entregador.html', label: 'Entregas', icon: '🚚' }
  ];

  function getCurrentPage() {
    var path = window.location.pathname;
    var file = path.split('/').pop() || '';
    return file;
  }

  function injectSkipLink() {
    var main = document.querySelector('main, [role="main"], .main-content, #main-content');
    if (!main && !document.getElementById('main-content')) return;

    var skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'Pular para conteúdo principal';
    skipLink.style.cssText = 'position:absolute;top:-40px;left:0;background:var(--accent,#3b82f6);color:#fff;padding:8px 16px;z-index:9999;transition:top 0.15s ease;text-decoration:none;font-size:14px;';
    skipLink.addEventListener('focus', function () { this.style.top = '0'; });
    skipLink.addEventListener('blur', function () { this.style.top = '-40px'; });

    document.body.insertBefore(skipLink, document.body.firstChild);

    if (main && !main.id) main.id = 'main-content';
  }

  function injectNav() {
    // Don't inject nav on login page or portal (escola has its own nav)
    var currentPage = getCurrentPage();
    if (currentPage === 'login.html' || currentPage === 'gdp-portal.html') return;

    // Check if nav already exists (avoid double-inject)
    if (document.getElementById('gdp-shared-nav')) return;

    var nav = document.createElement('nav');
    nav.id = 'gdp-shared-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Navegação principal GDP');
    nav.style.cssText = 'display:flex;align-items:center;gap:4px;padding:8px 16px;background:var(--bg-soft,#1e293b);border-bottom:1px solid var(--border,#334155);font-size:13px;flex-wrap:wrap;';

    // Logo/brand
    var brand = document.createElement('span');
    brand.style.cssText = 'font-weight:700;color:var(--accent,#3b82f6);margin-right:12px;font-size:14px;';
    brand.textContent = 'GDP';
    nav.appendChild(brand);

    // Nav links
    NAV_ITEMS.forEach(function (item) {
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.icon + ' ' + item.label;
      a.style.cssText = 'color:var(--text-secondary,#94a3b8);text-decoration:none;padding:4px 10px;border-radius:6px;transition:all 0.15s ease;';
      a.setAttribute('role', 'link');

      if (currentPage === item.href) {
        a.style.color = 'var(--text,#f1f5f9)';
        a.style.background = 'var(--accent-soft,rgba(59,130,246,0.15))';
        a.setAttribute('aria-current', 'page');
      }

      a.addEventListener('mouseenter', function () {
        if (currentPage !== item.href) this.style.background = 'var(--surface-2,#334155)';
      });
      a.addEventListener('mouseleave', function () {
        if (currentPage !== item.href) this.style.background = 'transparent';
      });

      nav.appendChild(a);
    });

    // Sync status indicator
    var syncIndicator = document.createElement('span');
    syncIndicator.id = 'sync-status-indicator';
    syncIndicator.style.cssText = 'margin-left:auto;font-size:10px;';
    syncIndicator.textContent = '⚪';
    syncIndicator.title = 'Status de sincronização';
    syncIndicator.setAttribute('role', 'status');
    syncIndicator.setAttribute('aria-live', 'polite');
    nav.appendChild(syncIndicator);

    // User/logout area
    var userArea = document.createElement('span');
    userArea.style.cssText = 'color:var(--text-muted,#64748b);font-size:12px;margin-left:8px;';
    try {
      var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
      userArea.textContent = emp.nomeFantasia || emp.nome || '';
    } catch (_) {}
    nav.appendChild(userArea);

    document.body.insertBefore(nav, document.body.firstChild);
  }

  function enhanceA11y() {
    // Story 5.11: Add aria attributes to common patterns

    // Tabs: add role="tab" to tab buttons
    document.querySelectorAll('[data-tab], .tab-btn, .tab-button').forEach(function (el) {
      if (!el.getAttribute('role')) el.setAttribute('role', 'tab');
      var isActive = el.classList.contains('active') || el.getAttribute('aria-selected') === 'true';
      el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Tab panels
    document.querySelectorAll('[data-tab-panel], .tab-panel, .tab-content').forEach(function (el) {
      if (!el.getAttribute('role')) el.setAttribute('role', 'tabpanel');
    });

    // Modals
    document.querySelectorAll('.modal, [data-modal]').forEach(function (el) {
      if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
    });

    // Toast container
    var toastContainer = document.querySelector('.toast-container, #toast-container, #toasts');
    if (toastContainer) {
      toastContainer.setAttribute('role', 'status');
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-atomic', 'true');
    }

    // Images without alt
    document.querySelectorAll('img:not([alt])').forEach(function (img) {
      img.setAttribute('alt', '');
    });

    // Clickable divs without role
    document.querySelectorAll('div[onclick]:not([role])').forEach(function (el) {
      el.setAttribute('role', 'button');
      if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectSkipLink();
      injectNav();
      enhanceA11y();
    });
  } else {
    injectSkipLink();
    injectNav();
    enhanceA11y();
  }
})();
