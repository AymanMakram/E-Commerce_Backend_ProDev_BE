// frontend/frontend/js/base.js
// Shared page-wide UI helpers for templates/base.html.
// - Provides a Bootstrap toast helper (window.showToast)
// - Keeps the cart badge in sync (window.refreshCartBadge)

(function () {
  'use strict';

  /**
   * Render a Bootstrap toast into #toast-container.
   * Falls back to alert() if the container is missing.
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
      alert(message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    toast.role = 'alert';

    const wrap = document.createElement('div');
    wrap.className = 'd-flex';

    const body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = String(message ?? '');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close btn-close-white me-2 m-auto';
    close.setAttribute('data-bs-dismiss', 'toast');
    close.setAttribute('aria-label', 'Close');

    wrap.appendChild(body);
    wrap.appendChild(close);
    toast.appendChild(wrap);

    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4000);
  }

  function computeTotalQty(items) {
    return (items || []).reduce((sum, item) => {
      const q = parseInt(item?.qty ?? item?.quantity ?? 0, 10);
      return sum + (Number.isNaN(q) ? 0 : q);
    }, 0);
  }

  /**
   * Update cart count from a cart API response payload.
   * Prefers VeloState (api.js) so all listeners stay consistent.
   */
  function updateGlobalCartCount(data) {
    const totalQty = computeTotalQty(data?.items);
    if (window.VeloState && typeof window.VeloState.setCartCount === 'function') {
      window.VeloState.setCartCount(totalQty);
      return;
    }

    // Fallback: update the badge directly.
    const cartCountElement = document.getElementById('cart-count');
    if (!cartCountElement) return;
    cartCountElement.textContent = String(totalQty);
    cartCountElement.classList.remove('badge-update');
    void cartCountElement.offsetWidth;
    cartCountElement.classList.add('badge-update');
  }

  /**
   * Fetch cart data and update the global badge.
   * - Guests can browse products: don't force login by calling cart APIs.
   * - Sellers don't see customer cart UI.
   */
  async function refreshCartBadge() {
    try {
      let token = null;
      let userType = null;
      try {
        token = localStorage.getItem('access_token');
        userType = localStorage.getItem('user_type');
      } catch (_) {
        // ignore
      }

      if (!token) return;
      if (userType === 'seller') return;

      const apiUrl = window.CART_CONFIG?.apiUrl || '/api/cart/';
      const url = `${apiUrl}?t=${Date.now()}`;

      const response = (typeof window.request === 'function')
        ? await window.request(url, { method: 'GET' })
        : await fetch(url, { credentials: 'include' });

      if (!response) return;
      if (!response.ok) return;

      const data = await response.json().catch(() => null);
      if (!data) return;
      updateGlobalCartCount(data);
    } catch (_) {
      // Intentionally ignore: badge refresh should never break the page.
    }
  }

  // Expose globals used across page scripts.
  window.showToast = showToast;
  window.refreshCartBadge = refreshCartBadge;
  window.updateGlobalCartCount = updateGlobalCartCount;

  document.addEventListener('DOMContentLoaded', () => {
    refreshCartBadge();
  });
})();
