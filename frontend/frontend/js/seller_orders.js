// frontend/frontend/js/seller_orders.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const root = byId('seller-orders-root');
  const paginationEl = byId('seller-orders-pagination');
  const metaEl = byId('so-meta');
  const chipsEl = byId('so-status-chips');

  const searchInput = byId('so-search');
  const statusSelect = byId('so-status');
  const dateFromInput = byId('so-date-from');
  const dateToInput = byId('so-date-to');
  const applyBtn = byId('so-apply');
  const resetBtn = byId('so-reset');

  let currentBaseUrl = '/api/orders/seller-orders/';
  let searchDebounceId = null;
  let cachedStatuses = null;
  let loadedTotal = 0;

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

  function getPaginatedResults(data) {
    if (!data) return { results: [], next: null, previous: null, count: 0 };
    if (Array.isArray(data)) return { results: data, next: null, previous: null, count: data.length };
    return {
      results: Array.isArray(data.results) ? data.results : [],
      next: data.next || null,
      previous: data.previous || null,
      count: Number(data.count) || 0,
    };
  }

  function renderLoading() {
    if (!root) return;
    root.innerHTML = `
      <div class="card border-0 shadow-sm p-4" style="border-radius:16px;">
        <div class="d-flex align-items-center gap-3">
          <div class="spinner-border text-info" role="status" aria-hidden="true"></div>
          <div class="text-muted">جاري تحميل الطلبات...</div>
        </div>
      </div>
    `;
  }

  function renderEmpty() {
    if (!root) return;
    root.innerHTML = `
      <div class="card border-0 shadow-sm p-4" style="border-radius:16px;">
        <div class="fw-bold" style="color:#0f172a;">لا توجد طلبات لهذا المتجر</div>
        <div class="text-muted">ستظهر الطلبات هنا عند قيام العملاء بالشراء.</div>
      </div>
    `;
  }

  function renderError(message) {
    if (!root) return;
    root.innerHTML = `<div class="alert alert-danger">${esc(message)}</div>`;
  }

  function renderPagination({ next }, onLoadMore) {
    if (!paginationEl) return;

    if (!next) {
      paginationEl.innerHTML = '';
      return;
    }

    paginationEl.innerHTML = `
      <div class="d-grid mt-3">
        <button type="button" class="btn btn-outline-info rounded-pill" id="so-more" style="border-color:#00BCD4;color:#00BCD4;">تحميل المزيد</button>
      </div>
    `;

    const moreBtn = byId('so-more');
    moreBtn?.addEventListener('click', async () => {
      moreBtn.disabled = true;
      moreBtn.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> جاري التحميل...`;
      try {
        await onLoadMore(next);
      } finally {
        // If more pages remain, next renderPagination call will recreate button.
      }
    });
  }

  function setMeta(text) {
    if (!metaEl) return;
    metaEl.textContent = text || '';
  }

  function setActiveChip(statusId) {
    if (!chipsEl) return;
    chipsEl.querySelectorAll('[data-so-chip]')?.forEach((el) => {
      const id = el.getAttribute('data-so-chip');
      el.classList.toggle('active', String(id) === String(statusId));
    });
  }

  function statusSelectHtml(order, statuses) {
    const currentId = String(order.order_status_id ?? '');
    const canUpdate = !!order?.can_update_status;
    const options = statuses
      .map((s) => {
        const selected = String(s.id) === currentId ? 'selected' : '';
        return `<option value="${esc(s.id)}" ${selected}>${esc(s.status)}</option>`;
      })
      .join('');

    return `
      <select class="form-select form-select-sm w-auto" data-action="status-select" data-order-id="${order.id}" ${canUpdate ? '' : 'disabled'}>
        ${options}
      </select>
    `;
  }

  function lineStatusSelectHtml(orderId, line, statuses, disabled) {
    const currentId = String(line?.line_status_id ?? '');
    const options = statuses
      .map((s) => {
        const selected = String(s.id) === currentId ? 'selected' : '';
        return `<option value="${esc(s.id)}" ${selected}>${esc(s.status)}</option>`;
      })
      .join('');

    return `
      <div class="d-flex align-items-center gap-2">
        <select class="form-select form-select-sm" style="max-width:180px" data-action="line-status-select" data-line-id="${line.id}" ${disabled ? 'disabled' : ''}>
          ${options}
        </select>
        <button class="btn btn-sm btn-outline-info rounded-pill" style="border-color:#00BCD4;color:#00BCD4;" data-action="line-status-save" data-line-id="${line.id}" data-order-id="${orderId}" ${disabled ? 'disabled' : ''}>تحديث</button>
      </div>
    `;
  }

  function linesHtml(orderId, lines, statuses, showActions) {
    const list = Array.isArray(lines) ? lines : [];
    if (!list.length) return '<div class="text-muted small">لا توجد عناصر.</div>';

    const actionTh = showActions ? '<th class="text-end">إجراء</th>' : '';

    const body = list
      .map((l) => {
        const canUpdateLine = !!l?.line_can_update_status;
        const actionTd = showActions
          ? `<td class="text-end">${lineStatusSelectHtml(orderId, l, statuses, !canUpdateLine)}</td>`
          : '';

        return `
          <tr>
            <td>${esc(l.product_name || '')}</td>
            <td><span class="badge bg-secondary">${esc(l.sku || '')}</span></td>
            <td class="fw-bold">x${Number(l.qty ?? 0)}</td>
            <td>${money(l.price)} ج.م</td>
            <td><span class="badge rounded-pill" style="background:rgba(148,163,184,.18); color:#334155; border:1px solid rgba(148,163,184,.35);">${esc(l.line_status_display || 'Pending')}</span></td>
            ${actionTd}
          </tr>
        `;
      })
      .join('');

    return `
      <div class="table-responsive mt-2">
        <table class="table table-sm align-middle mb-0">
          <thead>
            <tr class="text-muted small">
              <th>المنتج</th>
              <th>SKU</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>حالة القطعة</th>
              ${actionTh}
            </tr>
          </thead>
          <tbody>
            ${body}
          </tbody>
        </table>
      </div>
    `;
  }

  function orderCardHtml(order, statuses) {
    const canUpdate = !!order?.can_update_status;
    const isMultiVendor = !canUpdate;
    const otherCount = Number(order?.other_sellers_lines_count ?? 0) || 0;
    const addr = order?.shipping_address_details || null;
    const shipShort = addr ? [addr.city, addr.region].filter(Boolean).join('، ') : '';
    const customerPhone = order?.customer_phone_number || '';
    const customerUsername = order?.customer_username || '';

    const carrier = order?.shipping_carrier || '';
    const tracking = order?.tracking_number || '';
    const shippedAt = order?.shipped_at ? formatDate(order.shipped_at) : '';
    const deliveredAt = order?.delivered_at ? formatDate(order.delivered_at) : '';

    return `
      <div class="card border-0 shadow-sm p-4 mb-3" style="border-radius:16px;">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-bold" style="color:#0f172a;">طلب رقم #${order.id}</div>
            <div class="text-muted small">تاريخ الطلب: ${formatDate(order.order_date)}</div>
            <div class="text-muted small">حالة الدفع: ${paymentBadge(order.payment_status)}</div>
            ${shipShort ? `<div class="text-muted small">الشحن: <span class="fw-bold">${esc(shipShort)}</span></div>` : ''}
            ${customerUsername ? `<div class="text-muted small">العميل: <span class="fw-bold">${esc(customerUsername)}</span></div>` : ''}
            ${customerPhone ? `<div class="text-muted small">هاتف العميل: <span class="fw-bold">${esc(customerPhone)}</span></div>` : ''}
          </div>
          <div class="text-end">
            <div class="text-muted small">الإجمالي</div>
            <div class="fw-bold" style="color:#00BCD4;">${money(order.order_total)} ج.م</div>
            <div class="mt-2">
              <a class="btn btn-sm btn-outline-secondary rounded-pill" href="/orders/track/${order.id}/">تفاصيل</a>
            </div>
          </div>
        </div>

        <div class="row g-2 mt-3">
          <div class="col-12 col-md-4">
            <label class="form-label small text-muted mb-1">شركة الشحن</label>
            <input class="form-control form-control-sm" placeholder="مثال: Aramex" value="${esc(carrier)}" data-action="ship-carrier" data-order-id="${order.id}" />
          </div>
          <div class="col-12 col-md-5">
            <label class="form-label small text-muted mb-1">رقم التتبع</label>
            <input class="form-control form-control-sm" placeholder="Tracking" value="${esc(tracking)}" data-action="ship-tracking" data-order-id="${order.id}" />
          </div>
          <div class="col-12 col-md-3">
            <label class="form-label small text-muted mb-1">الحالة الزمنية</label>
            <div class="small text-muted" style="line-height:1.35;">
              ${shippedAt ? `شُحن: <span class="fw-bold">${esc(shippedAt)}</span><br/>` : ''}
              ${deliveredAt ? `سُلّم: <span class="fw-bold">${esc(deliveredAt)}</span>` : ''}
              ${(!shippedAt && !deliveredAt) ? '—' : ''}
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
          <div>
            <span class="badge rounded-pill" style="background:rgba(0,188,212,.12); color:#00BCD4; border:1px solid rgba(0,188,212,.35);">${esc(order.status_display || '')}</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="text-muted small">تغيير الحالة:</div>
            ${statusSelectHtml(order, statuses)}
            <button class="btn btn-sm btn-info text-white rounded-pill" data-action="status-save" data-order-id="${order.id}" ${canUpdate ? '' : 'disabled'}>تحديث</button>
          </div>
        </div>

        ${canUpdate ? '' : `
          <div class="mt-2 small text-muted">
            هذا طلب متعدد البائعين — لا يمكن تغيير حالة الطلب العامة من هنا.
            ${otherCount > 0 ? ` <span class="fw-bold">(${otherCount} عناصر لبائعين آخرين مخفية)</span>` : ''}
          </div>
        `}

        ${linesHtml(order.id, order.lines, statuses, isMultiVendor)}
      </div>
    `;
  }

  async function loadStatuses() {
    const res = await window.request('/api/orders/statuses/');
    if (!res) return [];
    const data = await readJsonSafe(res);
    return Array.isArray(data) ? data : [];
  }

  async function ensureStatuses() {
    if (Array.isArray(cachedStatuses)) return cachedStatuses;
    cachedStatuses = await loadStatuses();
    return cachedStatuses;
  }

  function fillStatusOptions(statuses) {
    if (!statusSelect) return;
    const current = statusSelect.value;
    statusSelect.innerHTML = '<option value="">كل الحالات</option>';
    statuses.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = String(s.id);
      opt.textContent = String(s.status);
      statusSelect.appendChild(opt);
    });
    if (current) statusSelect.value = current;
  }

  function renderStatusChips(statuses) {
    if (!chipsEl) return;
    if (!Array.isArray(statuses) || !statuses.length) {
      chipsEl.innerHTML = '';
      return;
    }

    const current = String(statusSelect?.value || '');

    const chip = (id, label, active) => {
      const base = 'btn btn-sm rounded-pill';
      const cls = active
        ? `${base} btn-info text-white`
        : `${base} btn-outline-info`;
      const style = active ? '' : 'style="border-color:#00BCD4;color:#00BCD4;"';
      return `<button type="button" class="${cls}" ${style} data-so-chip="${id}">${label}</button>`;
    };

    const html = [
      chip('', 'كل الحالات', !current),
      ...statuses.map((s) => chip(String(s.id), String(s.status), String(s.id) === current)),
    ].join('');

    chipsEl.innerHTML = html;

    chipsEl.querySelectorAll('[data-so-chip]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-so-chip');
        if (statusSelect) statusSelect.value = id || '';
        setActiveChip(id || '');
        currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
        pushUrlState();
        await loadSellerOrders(currentBaseUrl);
      });
    });
  }

  function parseFiltersFromUrl() {
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('q') || '';
      const status = u.searchParams.get('status') || '';
      const date_from = u.searchParams.get('date_from') || '';
      const date_to = u.searchParams.get('date_to') || '';

      if (searchInput) searchInput.value = q;
      if (statusSelect) statusSelect.value = status;
      if (dateFromInput) dateFromInput.value = date_from;
      if (dateToInput) dateToInput.value = date_to;
    } catch (_) {
      // ignore
    }
  }

  function pushUrlState() {
    try {
      const apiUrl = buildUrlWithFilters('/api/orders/seller-orders/');
      const u = new URL(apiUrl, window.location.origin);
      // Keep only filters in the browser URL (no API path)
      const browserUrl = `${window.location.pathname}${u.search}`;
      window.history.replaceState({}, '', browserUrl);
    } catch (_) {
      // ignore
    }
  }

  function buildUrlWithFilters(base) {
    const url = new URL(base, window.location.origin);
    const q = String(searchInput?.value || '').trim();
    const status = String(statusSelect?.value || '').trim();
    const date_from = String(dateFromInput?.value || '').trim();
    const date_to = String(dateToInput?.value || '').trim();

    if (q) url.searchParams.set('q', q);
    if (status) url.searchParams.set('status', status);
    if (date_from) url.searchParams.set('date_from', date_from);
    if (date_to) url.searchParams.set('date_to', date_to);

    return url.pathname + url.search;
  }

  function clearFilters() {
    if (searchInput) searchInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';
  }

  async function updateStatus(orderId, statusId) {
    const carrierInput = root?.querySelector(`[data-action="ship-carrier"][data-order-id="${orderId}"]`);
    const trackingInput = root?.querySelector(`[data-action="ship-tracking"][data-order-id="${orderId}"]`);
    const shipping_carrier = String(carrierInput?.value || '').trim();
    const tracking_number = String(trackingInput?.value || '').trim();

    const payload = { order_status: statusId };
    // Send even if blank so seller can clear fields
    payload.shipping_carrier = shipping_carrier;
    payload.tracking_number = tracking_number;

    const res = await window.request(`/api/orders/${orderId}/set-status/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res) return null;
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || 'فشل تحديث الحالة.';
      showToast(msg, 'danger');
      return null;
    }
    showToast('تم تحديث حالة الطلب.', 'success');
    return data;
  }

  async function updateLineStatus(orderId, lineId, statusId) {
    const res = await window.request(`/api/orders/${orderId}/set-line-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ line_id: lineId, line_status: statusId }),
    });
    if (!res) return null;
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || 'فشل تحديث حالة القطعة.';
      showToast(msg, 'danger');
      return null;
    }
    showToast('تم تحديث حالة القطعة.', 'success');
    return data;
  }

  function bindDelegatedActions() {
    if (!root) return;
    if (root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('[data-action="status-save"]');
      if (!btn) return;
      if (btn.disabled) return;
      const orderId = btn.getAttribute('data-order-id');
      const select = root.querySelector(`[data-action="status-select"][data-order-id="${orderId}"]`);
      const statusId = select?.value;
      if (!orderId || !statusId) return;

      btn.disabled = true;
      const prevHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> تحديث`;
      const updated = await updateStatus(orderId, statusId);
      btn.disabled = false;
      btn.innerHTML = prevHtml;

      if (updated) {
        // Update just this card's badge + status id locally without a full reload
        const card = btn.closest('.card');
        const badge = card?.querySelector('.badge');
        const selectedLabel = select?.selectedOptions?.[0]?.textContent;
        if (badge && selectedLabel) badge.textContent = selectedLabel;
      }
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('[data-action="line-status-save"]');
      if (!btn) return;
      if (btn.disabled) return;

      const orderId = btn.getAttribute('data-order-id');
      const lineId = btn.getAttribute('data-line-id');
      const select = root.querySelector(`[data-action="line-status-select"][data-line-id="${lineId}"]`);
      const statusId = select?.value;
      if (!orderId || !lineId || !statusId) return;

      btn.disabled = true;
      const prev = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> تحديث`;
      try {
        const updated = await updateLineStatus(orderId, lineId, statusId);
        if (updated) {
          currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
          await loadSellerOrders(currentBaseUrl);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = prev;
      }
    });
  }

  async function loadSellerOrders(url = currentBaseUrl, opts = {}) {
    if (typeof window.request !== 'function') return;

    const append = !!opts.append;

    if (!append) {
      loadedTotal = 0;
      renderLoading();
    }

    const statuses = await ensureStatuses();
    fillStatusOptions(statuses);
    renderStatusChips(statuses);
    setActiveChip(statusSelect?.value || '');

    bindDelegatedActions();

    const res = await window.request(url);
    if (!res) return;

    const data = await readJsonSafe(res);
    if (!res.ok) {
      renderError((data && data.detail) || 'تعذر تحميل الطلبات.');
      return;
    }

    const { results, next, count } = getPaginatedResults(data);

    loadedTotal += results.length;
    if (count) setMeta(`إجمالي ${count} — تم تحميل ${loadedTotal}`);
    else if (loadedTotal) setMeta(`تم تحميل ${loadedTotal} طلب`);
    else setMeta('');

    if (!results.length) {
      renderEmpty();
      renderPagination({ next: null }, async () => {});
      return;
    }

    if (!root) return;

    if (append) {
      root.insertAdjacentHTML('beforeend', results.map((o) => orderCardHtml(o, statuses)).join(''));
    } else {
      root.innerHTML = results.map((o) => orderCardHtml(o, statuses)).join('');
    }

    renderPagination({ next }, async (n) => {
      if (!n) return;
      await loadSellerOrders(n, { append: true });
    });
  }

  function bindToolbar() {
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
        pushUrlState();
        await loadSellerOrders(currentBaseUrl);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        clearFilters();
        currentBaseUrl = '/api/orders/seller-orders/';
        setMeta('');
        loadedTotal = 0;
        pushUrlState();
        await loadSellerOrders(currentBaseUrl);
      });
    }

    // Debounced search
    searchInput?.addEventListener('input', () => {
      if (searchDebounceId) window.clearTimeout(searchDebounceId);
      searchDebounceId = window.setTimeout(async () => {
        currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
        pushUrlState();
        await loadSellerOrders(currentBaseUrl);
      }, 350);
    });

    // Immediate apply on status/date change
    statusSelect?.addEventListener('change', async () => {
      setActiveChip(statusSelect.value);
      currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
      pushUrlState();
      await loadSellerOrders(currentBaseUrl);
    });

    dateFromInput?.addEventListener('change', async () => {
      currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
      pushUrlState();
      await loadSellerOrders(currentBaseUrl);
    });

    dateToInput?.addEventListener('change', async () => {
      currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
      pushUrlState();
      await loadSellerOrders(currentBaseUrl);
    });

    // Convenience: press Enter in search
    searchInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
        pushUrlState();
        await loadSellerOrders(currentBaseUrl);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');
    bindToolbar();
    parseFiltersFromUrl();
    currentBaseUrl = buildUrlWithFilters('/api/orders/seller-orders/');
    pushUrlState();
    await loadSellerOrders(currentBaseUrl);
  });
})();
