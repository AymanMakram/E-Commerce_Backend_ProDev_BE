// frontend/frontend/js/order_history.js

(function () {
  'use strict';

  const listEl = document.getElementById('order-history-list');
  const emptyEl = document.getElementById('order-history-empty');
  const skeletonEl = document.getElementById('order-history-skeleton');
  const loadMoreBtn = document.getElementById('orders-load-more');
  const refreshBtn = document.getElementById('orders-refresh');

  const state = {
    nextUrl: '/api/orders/my-orders/',
    loading: false,
  };

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    if (skeletonEl) skeletonEl.classList.toggle('d-none', !isLoading);
    if (refreshBtn) refreshBtn.disabled = isLoading;
    if (loadMoreBtn) loadMoreBtn.disabled = isLoading;
  }

  function setEmpty(isEmpty) {
    if (emptyEl) emptyEl.classList.toggle('d-none', !isEmpty);
  }

  function formatMoneyEGP(value) {
    const v = Number(value || 0);
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  }

  function formatDate(value) {
    const s = String(value || '').trim();
    return s || '—';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function orderRow(order) {
    const id = order?.id;
    const status = escapeHtml(order?.status_display || order?.status || '');
    const total = formatMoneyEGP(order?.order_total);
    const date = escapeHtml(formatDate(order?.order_date));

    return `
      <a href="/orders/track/${id}/" class="list-group-item list-group-item-action mb-2" style="border-radius: 14px;">
        <div class="d-flex w-100 justify-content-between align-items-center">
          <div class="fw-bold">طلب رقم #${id}</div>
          <span class="badge bg-secondary">${status || '—'}</span>
        </div>
        <div class="mt-2 text-muted">الإجمالي: <span class="fw-bold text-info">${total}</span></div>
        <div class="mt-1 small text-muted">تاريخ الطلب: ${date}</div>
      </a>`;
  }

  function appendOrders(orders) {
    if (!listEl) return;
    const rows = (orders || []).map(orderRow).join('');
    listEl.insertAdjacentHTML('beforeend', rows);
  }

  async function loadPage(url, { reset } = { reset: false }) {
    if (state.loading) return;
    if (!url) return;

    setLoading(true);
    try {
      if (reset && listEl) listEl.innerHTML = '';
      if (reset) setEmpty(false);

      const res = await window.request(url);
      if (!res) return; // request() handles auth redirects

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err?.detail || 'تعذر تحميل الطلبات.', 'danger');
        return;
      }

      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);

      if (reset && (!results || results.length === 0)) {
        setEmpty(true);
      }

      appendOrders(results);

      state.nextUrl = data?.next || null;
      if (loadMoreBtn) loadMoreBtn.classList.toggle('d-none', !state.nextUrl);
    } catch (e) {
      console.error('Order history load failed', e);
      showToast('تعذر الاتصال بالخادم.', 'danger');
    } finally {
      setLoading(false);
    }
  }

  function bind() {
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => loadPage(state.nextUrl, { reset: false }));
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        state.nextUrl = '/api/orders/my-orders/';
        loadPage(state.nextUrl, { reset: true });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!listEl) return;
    if (typeof window.request !== 'function') return;

    bind();
    loadPage(state.nextUrl, { reset: true });
  });
})();
