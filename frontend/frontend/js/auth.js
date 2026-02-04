// frontend/frontend/js/auth.js

(function () {
  'use strict';

  let mePromise = null;

  function getSafeNextFromUrl() {
    try {
      const u = new URL(window.location.href);
      const next = u.searchParams.get('next');
      if (next && next.startsWith('/')) return next;
      return null;
    } catch (_) {
      return null;
    }
  }

  function getLoginHrefWithNext() {
    const base = '/api/accounts/login-view/';
    const next = `${window.location.pathname || ''}${window.location.search || ''}`;
    const safeNext = (next && next.startsWith('/') && !next.startsWith('/api/accounts/login-view')) ? next : '/products/';
    return `${base}?next=${encodeURIComponent(safeNext)}`;
  }

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  async function fetchMe() {
    try {
      const res = await fetch('/api/accounts/profile/me/', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data || !data.id) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function getMe(forceRefresh = false) {
    if (forceRefresh) mePromise = null;
    if (!mePromise) mePromise = fetchMe();
    return mePromise;
  }

  function redirectSellerFromCustomerPages(isSeller) {
    if (!isSeller) return;
    const path = String(window.location.pathname || '/');

    // Allow seller area and order tracking details (used by sellers too)
    if (path.startsWith('/seller/')) return;
    if (path.startsWith('/orders/track/')) return;

    const isCustomerOnly =
      path === '/profile/' ||
      path === '/cart/' ||
      path.startsWith('/cart/') ||
      path === '/orders/' ||
      path === '/orders' ||
      path === '/products/' ||
      path.startsWith('/products/');

    if (isCustomerOnly) window.location.replace('/seller/');
  }

  async function updateNavbar() {
    const authSection = document.getElementById('auth-section');
    if (!authSection) return;

    const me = await getMe();
    const token = Boolean(me);
    const username = me?.username || '';
    const userType = me?.user_type || '';

    const brandLink = document.getElementById('nav-brand-link');
    const productsLink = document.getElementById('nav-products-link');
    const cartLink = document.getElementById('nav-cart-link');
    const ordersLink = document.getElementById('nav-orders-link');

    // Hide customer-only links for sellers
    const isSeller = Boolean(token) && userType === 'seller';
    const isCustomerAuthed = Boolean(token) && !isSeller;
    if (brandLink) brandLink.setAttribute('href', isSeller ? '/seller/' : '/products/');
    if (productsLink) productsLink.classList.toggle('d-none', isSeller);
    if (cartLink) cartLink.classList.toggle('d-none', isSeller);
    if (ordersLink) ordersLink.classList.toggle('d-none', !isCustomerAuthed);

    redirectSellerFromCustomerPages(isSeller);

    if (token && username) {
      const esc = (v) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? ''));
      const safeUsername = esc(username);
      authSection.innerHTML = `
        <div class="d-flex align-items-center">
          <a href="${isSeller ? '/seller/profile/' : '/profile/'}" class="d-flex align-items-center justify-content-center me-2" style="width:38px;height:38px;border-radius:50%;background:#e0f7fa;overflow:hidden;text-decoration:none;">
            <i class="fa-solid fa-user" style="color:#00BCD4;font-size:1.3rem;"></i>
          </a>
          <span class="text-white me-3 small">مرحباً، <strong class="user-name-highlight">${safeUsername}</strong></span>
          ${isSeller ? `
            <a href="/seller/" class="btn btn-sm btn-outline-info rounded-pill px-3 me-2" style="border-color:#00BCD4;color:#00BCD4;">لوحة التحكم</a>
            <a href="/seller/orders/" class="btn btn-sm btn-outline-info rounded-pill px-3 me-2" style="border-color:#00BCD4;color:#00BCD4;">الطلبات</a>
          ` : ''}
          <button id="logout-btn" class="btn btn-sm btn-outline-danger rounded-pill px-3">خروج</button>
        </div>
      `;
      const btn = document.getElementById('logout-btn');
      if (btn) btn.addEventListener('click', handleLogout);
    } else {
      // For guests: keep cart link visible but route to login with next=/cart/
      if (cartLink) cartLink.setAttribute('href', `${getLoginHrefWithNext().split('?')[0]}?next=${encodeURIComponent('/cart/')}`);
      authSection.innerHTML = `
        <a href="${getLoginHrefWithNext()}" class="btn btn-sm btn-info text-white rounded-pill px-4">تسجيل دخول</a>
      `;
    }
  }

  async function handleLogout() {
    try {
      if (typeof window.request === 'function') {
        await window.request('/api/accounts/logout/', { method: 'POST', redirectOnAuthError: false });
      } else {
        await fetch('/api/accounts/logout/', { method: 'POST', credentials: 'include' });
      }
    } catch (_) {
      // ignore
    } finally {
      mePromise = null;
      window.location.replace('/api/accounts/login-view/');
    }
  }

  window.handleLogout = handleLogout;

  async function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const errorDiv = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');
      const spinner = document.getElementById('login-spinner');

      if (!usernameInput || !passwordInput) return;
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (errorDiv) {
        errorDiv.classList.add('d-none');
        errorDiv.textContent = '';
      }
      if (btn) btn.disabled = true;
      if (spinner) spinner.classList.remove('d-none');

      try {
        const res = await fetch('/api/accounts/login/', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          // Establish CSRF cookie for subsequent session-auth requests.
          if (window.__velo?.ensureCsrfToken) await window.__velo.ensureCsrfToken();

          const next = getSafeNextFromUrl();
          const me = await getMe(true);
          if (next) {
            window.location.replace(next);
          } else {
            window.location.replace(me?.user_type === 'seller' ? '/seller/' : '/products/');
          }
          return;
        }

        if (errorDiv) {
          errorDiv.textContent = data.detail || 'تأكد من صحة اسم المستخدم أو كلمة المرور.';
          errorDiv.classList.remove('d-none');
        } else {
          showToast('فشل تسجيل الدخول.', 'danger');
        }
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = 'تعذر الاتصال بالخادم.';
          errorDiv.classList.remove('d-none');
        } else {
          showToast('تعذر الاتصال بالخادم.', 'danger');
        }
      } finally {
        if (btn) btn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    updateNavbar();
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');
    initLoginForm();
  });

  window.updateNavbar = updateNavbar;
  window.__veloAuth = { getMe };
})();
