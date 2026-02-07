// frontend/frontend/js/order_track.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const detailsEl = byId('order-track-details');
  const statusUpdateEl = byId('order-status-update');

  const esc = (value) => {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

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

  function paymentBadge(raw) {
    const s = String(raw || '').trim();
    const key = s.toLowerCase();

    const pill = (text, bg, fg, border) =>
      `<span class="badge rounded-pill" style="background:${bg}; color:${fg}; border:1px solid ${border};">${esc(text)}</span>`;

    if (!s || key === 'pending') return pill('قيد الانتظار', 'rgba(245,158,11,.12)', '#b45309', 'rgba(245,158,11,.35)');
    if (key === 'success' || key === 'paid') return pill('تم الدفع', 'rgba(34,197,94,.12)', '#16a34a', 'rgba(34,197,94,.35)');
    if (key === 'cancelled' || key === 'canceled' || key === 'failed') return pill('ملغي', 'rgba(239,68,68,.12)', '#b91c1c', 'rgba(239,68,68,.35)');
    if (key === 'refunded') return pill('تم الاسترجاع', 'rgba(99,102,241,.12)', '#4338ca', 'rgba(99,102,241,.35)');
    return pill(s, 'rgba(148,163,184,.18)', '#334155', 'rgba(148,163,184,.35)');
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
    detailsEl.innerHTML = `<div class="alert alert-danger">${esc(message)}</div>`;
  }

  function renderOrder(order) {
    if (!detailsEl) return;

    const lines = Array.isArray(order.lines) ? order.lines : [];
    const addr = order.shipping_address_details || null;
    const customerUsername = order.customer_username || '';
    const customerPhone = order.customer_phone_number || '';

    const addressLine = (() => {
      if (!addr) return '';
      const parts = [
        addr.address_line1,
        addr.address_line2,
        addr.street_number ? `شارع ${addr.street_number}` : '',
        addr.unit_number ? `وحدة ${addr.unit_number}` : '',
        addr.city,
        addr.region,
        addr.postal_code,
        addr.country_name,
      ].filter(Boolean);
      return parts.join('، ');
    })();

    detailsEl.innerHTML = `
      <div class="card border-0 shadow-sm p-4 mb-3" style="border-radius:16px;">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-bold" style="color:#0f172a;">طلب رقم #${order.id}</div>
            <div class="text-muted small">تاريخ الطلب: ${formatDate(order.order_date)}</div>
            <div class="mt-2">الحالة الحالية: <span class="fw-bold" style="color:#00BCD4;">${esc(order.status_display || '')}</span></div>
            <div class="text-muted small">حالة الدفع: ${paymentBadge(order.payment_status)}</div>
          </div>
          <div class="text-end">
            <div class="text-muted small">الإجمالي</div>
            <div class="fw-bold" style="color:#00BCD4;">${money(order.order_total)} ج.م</div>
          </div>
        </div>

        <div class="row g-3 mt-2">
          <div class="col-12 col-lg-7">
            <div class="p-3" style="border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fa-solid fa-location-dot" style="color:#00BCD4;"></i>
                <div class="fw-bold" style="color:#0f172a;">عنوان الشحن</div>
              </div>
              <div class="text-muted">${esc(addressLine || '—')}</div>
            </div>
          </div>
          <div class="col-12 col-lg-5">
            <div class="p-3" style="border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fa-solid fa-user" style="color:#00BCD4;"></i>
                <div class="fw-bold" style="color:#0f172a;">بيانات العميل</div>
              </div>
              <div class="text-muted">اسم المستخدم: <span class="fw-bold">${esc(customerUsername || '—')}</span></div>
              <div class="text-muted mt-1">الهاتف: <span class="fw-bold">${esc(customerPhone || '—')}</span></div>
            </div>
          </div>
        </div>

        <h6 class="mt-4 mb-2">المنتجات</h6>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr class="text-muted small">
                <th>المنتج</th>
                <th>البائع</th>
                <th>SKU</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>حالة البائع</th>
              </tr>
            </thead>
            <tbody>
              ${lines
                .map(
                  (l) => `
                <tr>
                  <td>${esc(l.product_name || '')}</td>
                  <td>${esc(l.seller_name || '—')}${l.seller_username ? ` (${esc(l.seller_username)})` : ''}</td>
                  <td><span class="badge bg-secondary">${esc(l.sku || '')}</span></td>
                  <td class="fw-bold">x${Number(l.qty ?? 0)}</td>
                  <td>${money(l.price)} ج.م</td>
                  <td><span class="badge rounded-pill" style="background:rgba(148,163,184,.18); color:#334155; border:1px solid rgba(148,163,184,.35);">${esc(l.line_status_display || '—')}</span></td>
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

  async function renderStatusUpdate(order) {
    if (!statusUpdateEl) return;

    const me = await (window.__veloAuth?.getMe ? window.__veloAuth.getMe() : Promise.resolve(null));
    if (!me || me.user_type !== 'seller') {
      statusUpdateEl.innerHTML = '';
      return;
    }

    const canUpdate = !!order?.can_update_status;
    if (!canUpdate) {
      const otherCount = Number(order?.other_sellers_lines_count ?? 0) || 0;
      const totalCount = Number(order?.total_lines_count ?? 0) || 0;
      const ownCount = totalCount > 0 ? Math.max(0, totalCount - otherCount) : 0;

      statusUpdateEl.innerHTML = `
        <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
          <div class="alert alert-info border-0 mb-0" style="border-radius:14px;">
            هذا طلب متعدد البائعين، لذلك لا يمكنك تحديث الحالة العامة من هنا.
            ${otherCount > 0 ? `يوجد ${otherCount} عناصر لبائعين آخرين.` : ''}
            ${ownCount > 0 ? `عناصرك: ${ownCount}.` : ''}
          </div>
          <div class="small text-muted mt-2">
            لتحديث حالة عناصر متجرك، استخدم صفحة <a href="/seller/orders/" class="text-info">طلبات المتجر</a>.
          </div>
        </div>
      `;
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
        return `<option value="${esc(s.id)}" ${selected}>${esc(s.status)}</option>`;
      })
      .join('');

    statusUpdateEl.innerHTML = `
      <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
        <form id="status-update-form" class="d-flex flex-wrap align-items-center gap-2">
          <div class="fw-bold" style="color:#0f172a;">تحديث حالة الطلب</div>
          <select id="order-status-select" class="form-select form-select-sm w-auto">${options}</select>
          <button type="submit" class="btn btn-info btn-sm text-white rounded-pill" id="status-update-btn">تحديث</button>
        </form>
        <span class="badge rounded-pill mt-2" style="background:rgba(0,188,212,.12); color:#00BCD4; border:1px solid rgba(0,188,212,.35);">
          متاح فقط لطلبات متجر واحد
        </span>
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
        const message = (data && data.detail) || 'فشل تحديث حالة الطلب.';
        showToast(message, 'danger');

        if (res.status === 403) {
          statusUpdateEl.innerHTML = `
            <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
              <div class="alert alert-info border-0 mb-0" style="border-radius:14px;">
                لا يمكنك تحديث الحالة العامة لهذا الطلب لأن به عناصر لبائعين آخرين.
              </div>
              <div class="small text-muted mt-2">
                حدّث عناصر متجرك من صفحة <a href="/seller/orders/" class="text-info">طلبات المتجر</a>.
              </div>
            </div>
          `;
        }
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
