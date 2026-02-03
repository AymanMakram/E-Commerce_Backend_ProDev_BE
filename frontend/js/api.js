// frontend/js/api.js
// Single source of truth for network requests + app state

(function () {
  'use strict';

  const DEFAULTS = {
    apiBase: '', // '' => same-origin, set to 'http://127.0.0.1:8000' for standalone
    loginUrl: '/api/accounts/login-view/',
    mediaUrl: '/media/',
  };

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }

  function getConfig() {
    // You can override any of these from templates or a standalone index.html:
    // window.VELO_CONFIG = { apiBase, loginUrl, mediaUrl, csrfToken }
    const cfg = (window.VELO_CONFIG && typeof window.VELO_CONFIG === 'object') ? window.VELO_CONFIG : {};
    return {
      apiBase: cfg.apiBase ?? DEFAULTS.apiBase,
      loginUrl: cfg.loginUrl ?? DEFAULTS.loginUrl,
      mediaUrl: cfg.mediaUrl ?? DEFAULTS.mediaUrl,
      csrfToken: cfg.csrfToken || getCookie('csrftoken') || '',
    };
  }

  function absoluteUrl(endpoint) {
    const { apiBase } = getConfig();
    if (!endpoint) return apiBase;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    if (!apiBase) return endpoint;
    return apiBase.replace(/\/$/, '') + (endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
  }

  function clearAuthAndRedirect() {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('username');
    } catch (_) {
      // ignore
    }
    const { loginUrl } = getConfig();

    // Preserve where the user was so login can send them back.
    const next = `${window.location.pathname || ''}${window.location.search || ''}`;
    const safeNext = (next && next.startsWith('/')) ? next : '/products/';

    const join = (loginUrl && loginUrl.includes('?')) ? '&' : '?';
    window.location.replace(`${loginUrl}${join}next=${encodeURIComponent(safeNext)}`);
  }

  function authHeaders(extra = {}) {
    const { csrfToken } = getConfig();
    const headers = {
      'Accept': 'application/json',
      ...extra,
    };

    // Only set Content-Type if we are sending JSON
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';

    if (csrfToken) headers['X-CSRFToken'] = csrfToken;

    const token = (() => {
      try { return localStorage.getItem('access_token'); } catch (_) { return null; }
    })();

    if (token) headers['Authorization'] = `Bearer ${token}`;

    return headers;
  }

  /**
   * request(endpoint, options)
   * - Injects Authorization + CSRF
   * - On 401/403 clears localStorage and redirects to login immediately
   */
  async function request(endpoint, options = {}) {
    const finalOptions = { credentials: 'include', ...options };

    // Merge headers safely
    const originalHeaders = (finalOptions.headers && typeof finalOptions.headers === 'object') ? finalOptions.headers : {};
    finalOptions.headers = authHeaders(originalHeaders);

    // If body is FormData, let browser set content-type
    if (finalOptions.body && typeof FormData !== 'undefined' && finalOptions.body instanceof FormData) {
      delete finalOptions.headers['Content-Type'];
    }

    const response = await fetch(absoluteUrl(endpoint), finalOptions);

    if (response.status === 401 || response.status === 403) {
      clearAuthAndRedirect();
      return null;
    }

    return response;
  }

  // --- App State (cart count) ---
  const State = {
    cartCount: 0,
    setCartCount(nextCount) {
      const count = Number(nextCount) || 0;
      this.cartCount = count;
      document.dispatchEvent(new CustomEvent('velo:cartCount', { detail: { count } }));
    },
  };

  function bindCartBadge(badgeId = 'cart-count') {
    const el = document.getElementById(badgeId);
    if (!el) return;

    // initial
    el.textContent = String(State.cartCount || 0);

    document.addEventListener('velo:cartCount', (e) => {
      const count = e?.detail?.count ?? 0;
      el.textContent = String(count);
      el.classList.remove('badge-update');
      void el.offsetWidth;
      el.classList.add('badge-update');
    });
  }

  function normalizeMediaUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/')) return path;

    const { mediaUrl } = getConfig();
    const prefix = (mediaUrl || '/media/').endsWith('/') ? (mediaUrl || '/media/') : `${mediaUrl}/`;

    // If backend returns "media/..." just prefix with '/'
    if (path.startsWith('media/')) return `/${path}`;

    return `${prefix}${path}`;
  }

  // Expose
  window.request = request;
  window.VeloState = State;
  window.bindCartBadge = bindCartBadge;
  window.normalizeMediaUrl = normalizeMediaUrl;
  window.__velo = { getConfig, clearAuthAndRedirect };
})();
