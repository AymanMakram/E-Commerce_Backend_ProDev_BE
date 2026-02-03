// frontend/frontend/js/order_track.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const detailsEl = byId('order-track-details');
  const statusUpdateEl = byId('order-status-update');

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  async function readJsonSafe(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(value);
    }
  }

  function money(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value ?? '');
    return n.toFixed(2);
  }

  function renderLoading() {
    if (!detailsEl) return;
    detailsEl.innerHTML = `
      <div class="card border-0 shadow-sm p-4" style="border-radius:16px;">
        <div class="d-flex align-items-center gap-3">
          <div class="spinner-border text-info" role="status" aria-hidden="true"></div>
          <div class="text-muted">جاري تحميل تفاصيل الطلب...</div>
        </div>
      </div>
    `;
  }

  function renderError(message) {
    if (!detailsEl) return;
    detailsEl.innerHTML = `<div class="alert alert-danger">${message}</div>`;
  }

  function renderOrder(order) {
    if (!detailsEl) return;

    const lines = Array.isArray(order.lines) ? order.lines : [];

    detailsEl.innerHTML = `
      <div class="card border-0 shadow-sm p-4 mb-3" style="border-radius:16px;">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-bold" style="color:#0f172a;">طلب رقم #${order.id}</div>
            <div class="text-muted small">تاريخ الطلب: ${formatDate(order.order_date)}</div>
            <div class="mt-2">الحالة الحالية: <span class="fw-bold" style="color:#00BCD4;">${order.status_display || ''}</span></div>
            <div class="text-muted small">حالة الدفع: <span class="fw-bold">${order.payment_status || 'Pending'}</span></div>
          </div>
          <div class="text-end">
            <div class="text-muted small">الإجمالي</div>
            <div class="fw-bold" style="color:#00BCD4;">${money(order.order_total)} ج.م</div>
          </div>
        </div>

        <h6 class="mt-4 mb-2">المنتجات</h6>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr class="text-muted small">
                <th>المنتج</th>
                <th>SKU</th>
                <th>الكمية</th>
                <th>السعر</th>
              </tr>
            </thead>
            <tbody>
              ${lines
                .map(
                  (l) => `
                <tr>
                  <td>${l.product_name || ''}</td>
                  <td><span class="badge bg-secondary">${l.sku || ''}</span></td>
                  <td class="fw-bold">x${Number(l.qty ?? 0)}</td>
                  <td>${money(l.price)} ج.م</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function loadStatuses() {
    const res = await window.request('/api/orders/statuses/');
    if (!res) return [];
    const data = await readJsonSafe(res);
    return Array.isArray(data) ? data : [];
  }

  function isSeller() {
    try {
      return localStorage.getItem('user_type') === 'seller';
    } catch (_) {
      return false;
    }
  }

  async function renderStatusUpdate(order) {
    if (!statusUpdateEl) return;
    if (!isSeller()) {
      statusUpdateEl.innerHTML = '';
      return;
    }

    const statuses = await loadStatuses();
    if (!statuses.length) {
      statusUpdateEl.innerHTML = '';
      return;
    }

    const options = statuses
      .map((s) => {
        const selected = String(s.id) === String(order.order_status_id ?? '') ? 'selected' : '';
        return `<option value="${s.id}" ${selected}>${s.status}</option>`;
      })
      .join('');

    statusUpdateEl.innerHTML = `
      <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
        <form id="status-update-form" class="d-flex flex-wrap align-items-center gap-2">
          <div class="fw-bold" style="color:#0f172a;">تحديث حالة الطلب</div>
          <select id="order-status-select" class="form-select form-select-sm w-auto">${options}</select>
          <button type="submit" class="btn btn-info btn-sm text-white rounded-pill" id="status-update-btn">تحديث</button>
        </form>
      </div>
    `;

    const form = byId('status-update-form');
    const select = byId('order-status-select');
    const btn = byId('status-update-btn');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusId = select?.value;
      if (!statusId) return;

      btn.disabled = true;
      const res = await window.request(`/api/orders/${order.id}/set-status/`, {
        method: 'PATCH',
        body: JSON.stringify({ order_status: statusId }),
      });
      btn.disabled = false;

      if (!res) return;
      const data = await readJsonSafe(res);
      if (!res.ok) {
        showToast((data && data.detail) || 'فشل تحديث حالة الطلب.', 'danger');
        return;
      }

      showToast('تم تحديث حالة الطلب.', 'success');
      await loadOrder(order.id);
    });
  }

  function getOrderIdFromUrl() {
    const parts = String(window.location.pathname || '').split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    const n = Number(last);
    return Number.isFinite(n) ? n : null;
  }

  async function loadOrder(orderId) {
    if (!orderId) {
      renderError('رقم الطلب غير صحيح.');
      return;
    }

    renderLoading();

    const res = await window.request(`/api/orders/${orderId}/`);
    if (!res) return;

    const data = await readJsonSafe(res);
    if (!res.ok) {
      renderError((data && data.detail) || 'تعذر تحميل تفاصيل الطلب.');
      return;
    }

    renderOrder(data);
    await renderStatusUpdate(data);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');
    const orderId = getOrderIdFromUrl();
    await loadOrder(orderId);
  });
})();
