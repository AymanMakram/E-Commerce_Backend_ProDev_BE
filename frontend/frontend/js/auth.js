// frontend/frontend/js/auth.js

(function () {
  'use strict';

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

  function updateNavbar() {
    const username = (() => { try { return localStorage.getItem('username'); } catch (_) { return null; } })();
    const token = (() => { try { return localStorage.getItem('access_token'); } catch (_) { return null; } })();
    const authSection = document.getElementById('auth-section');
    if (!authSection) return;

    if (token && username) {
      authSection.innerHTML = `
        <div class="d-flex align-items-center">
          <a href="/profile/" class="d-flex align-items-center justify-content-center me-2" style="width:38px;height:38px;border-radius:50%;background:#e0f7fa;overflow:hidden;text-decoration:none;">
            <i class="fa-solid fa-user" style="color:#00BCD4;font-size:1.3rem;"></i>
          </a>
          <span class="text-white me-3 small">مرحباً، <strong class="user-name-highlight">${username}</strong></span>
          <button id="logout-btn" class="btn btn-sm btn-outline-danger rounded-pill px-3">خروج</button>
        </div>
      `;
      const btn = document.getElementById('logout-btn');
      if (btn) btn.addEventListener('click', handleLogout);
    } else {
      authSection.innerHTML = `
        <a href="${getLoginHrefWithNext()}" class="btn btn-sm btn-info text-white rounded-pill px-4">تسجيل دخول</a>
      `;
    }
  }

  window.handleLogout = function handleLogout() {
    try {
      localStorage.clear();
    } catch (_) {
      // ignore
    }
    window.location.replace('/api/accounts/login-view/');
  };

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.access) {
          localStorage.setItem('access_token', data.access);
          localStorage.setItem('refresh_token', data.refresh);
          localStorage.setItem('username', username);

          // Prefer returning to ?next= if present
          const next = getSafeNextFromUrl();

          // Determine user type (and persist it for seller-only UI)
          try {
            const profileRes = await fetch('/api/accounts/profile/me/', {
              headers: { 'Authorization': `Bearer ${data.access}` },
            });
            if (profileRes.ok) {
              const userData = await profileRes.json();
              try {
                localStorage.setItem('user_type', userData.user_type || '');
              } catch (_) {
                // ignore
              }
              if (next) {
                window.location.replace(next);
              } else {
                window.location.replace(userData.user_type === 'seller' ? '/seller/' : '/products/');
              }
              return;
            }
          } catch (_) {
            // ignore
          }

          window.location.replace(next || '/products/');
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

  document.addEventListener('DOMContentLoaded', () => {
    updateNavbar();
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');
    initLoginForm();
  });

  window.updateNavbar = updateNavbar;
})();
