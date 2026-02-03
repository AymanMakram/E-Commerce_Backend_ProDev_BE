// frontend/frontend/js/cart.js

(function () {
  'use strict';

  const cartItemsContainer = document.getElementById('cart-items-container');
  const cartEmpty = document.getElementById('cart-empty');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartTotal = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutSummary = document.getElementById('checkout-summary');
  const checkoutConfirmBtn = document.getElementById('checkout-confirm');

  const state = {
    selectedAddressId: null,
    selectedPaymentId: null,
    totalPrice: 0,
  };

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  function formatCurrencyEGP(value) {
    const numberValue = Number(value || 0);
    return numberValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  }

  function showCartSkeletons(count = 3) {
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      cartItemsContainer.innerHTML += `
        <div class="col-12">
          <div class="card border-0 shadow-sm p-3" style="border-radius: 18px;">
            <div class="d-flex align-items-center">
              <div class="skeleton" style="width:72px;height:72px;border-radius:14px;"></div>
              <div class="flex-grow-1 me-3">
                <div class="skeleton-text mb-2" style="height:14px;width:55%;"></div>
                <div class="skeleton-text" style="height:12px;width:35%;"></div>
              </div>
            </div>
          </div>
        </div>`;
    }
  }

  function updateTotals(totalPrice) {
    if (cartSubtotal) cartSubtotal.textContent = formatCurrencyEGP(totalPrice);
    if (cartTotal) cartTotal.textContent = formatCurrencyEGP(totalPrice);
  }

  function updateCartStateFromItems(items) {
    const totalQty = (items || []).reduce((sum, item) => {
      const q = parseInt(item.qty || item.quantity || 0, 10);
      return sum + (Number.isNaN(q) ? 0 : q);
    }, 0);
    if (window.VeloState) window.VeloState.setCartCount(totalQty);
  }

  function normalizeImageUrl(path) {
    if (!path) return '';
    if (typeof window.normalizeMediaUrl === 'function') return window.normalizeMediaUrl(path);
    if (path.startsWith('http') || path.startsWith('/')) return path;
    return '/' + path;
  }

  function renderCartItems(items) {
    if (!cartItemsContainer) return;

    if (!items || items.length === 0) {
      cartItemsContainer.innerHTML = '';
      if (cartEmpty) cartEmpty.classList.remove('d-none');
      return;
    }
    if (cartEmpty) cartEmpty.classList.add('d-none');

    cartItemsContainer.innerHTML = items.map((item) => {
      const name = item.product_name || item?.product_item?.product_name || 'منتج';
      const price = Number(item.price || item?.product_item?.price || 0);
      const qty = Number(item.qty || item.quantity || 1);
      const imagePath = normalizeImageUrl(item.image || item.product_image || item?.product_item?.product_image || '');

      return `
        <div class="col-12">
          <div class="card border-0 shadow-sm p-3" style="border-radius: 18px;">
            <div class="d-flex align-items-center">
              <div class="me-3" style="width:72px;height:72px;border-radius:14px;background:#f1f5f9;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                ${imagePath ? `<img src="${imagePath}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" />` : `<span class="text-muted small">IMG</span>`}
              </div>
              <div class="flex-grow-1">
                <div class="fw-bold">${name}</div>
                <div class="text-muted small">${formatCurrencyEGP(price)}</div>
                <div class="d-flex align-items-center mt-2">
                  <button class="btn btn-sm btn-outline-info rounded-pill" onclick="updateQuantity('${item.id}', ${Math.max(1, qty - 1)})">-</button>
                  <span class="mx-3 fw-bold">${qty}</span>
                  <button class="btn btn-sm btn-outline-info rounded-pill" onclick="updateQuantity('${item.id}', ${qty + 1})">+</button>
                  <button class="btn btn-sm btn-link text-danger ms-auto text-decoration-none" onclick="deleteCartItem('${item.id}')">
                    <i class="fa-solid fa-trash-can me-1"></i> حذف
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addressLabel(a) {
    const parts = [a.address_line1, a.city, a.region, a.postal_code].filter(Boolean);
    return parts.join(' - ') || `Address #${a.id}`;
  }

  function paymentLabel(p) {
    const parts = [p.payment_type_name, p.provider].filter(Boolean);
    return parts.join(' - ') || `Payment #${p.id}`;
  }

  async function loadProfileForCheckout() {
    const res = await window.request('/api/accounts/profile/me/');
    if (!res) return null;
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  }

  function pickDefaultId(list, defaultFlagKey = 'is_default') {
    if (!Array.isArray(list) || !list.length) return null;
    const def = list.find((x) => !!x?.[defaultFlagKey]);
    return String((def || list[0])?.id || '') || null;
  }

  // Keep original function name
  window.fetchCartFromApi = async function fetchCartFromApi(silent = false) {
    if (!cartItemsContainer && !silent) return;
    if (!silent) showCartSkeletons();

    try {
      const res = await window.request(`/api/cart/?t=${Date.now()}`);
      if (!res) return;
      const data = await res.json();

      const items = data.items || [];
      if (!silent) renderCartItems(items);
      updateTotals(data.total_price || 0);
      updateCartStateFromItems(items);
    } catch (e) {
      console.error('Cart fetch failed', e);
      if (!silent) showToast('تعذر تحميل السلة.', 'danger');
    }
  };

  // Keep original function name
  window.updateQuantity = async function updateQuantity(itemId, newQty) {
    if (!itemId || newQty < 1) return;

    try {
      const res = await window.request(`/api/cart/cart-items/${itemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: newQty }),
      });
      if (!res) return;

      if (res.ok) {
        window.fetchCartFromApi();
      } else {
        showToast('فشل تحديث الكمية.', 'danger');
      }
    } catch (e) {
      console.error('Quantity update failed', e);
      showToast('تعذر الاتصال بالخادم.', 'danger');
    }
  };

  window.deleteCartItem = async function deleteCartItem(itemId) {
    if (!itemId) return;
    if (!confirm('هل تريد حذف هذا المنتج من السلة؟')) return;

    try {
      const res = await window.request(`/api/cart/cart-items/${itemId}/`, { method: 'DELETE' });
      if (!res) return;

      if (res.ok) {
        showToast('تم حذف المنتج من السلة.', 'info');
        window.fetchCartFromApi();
      } else {
        showToast('فشل حذف المنتج.', 'danger');
      }
    } catch (e) {
      console.error('Delete failed', e);
      showToast('تعذر الاتصال بالخادم.', 'danger');
    }
  };

  function bindCheckoutModal() {
    if (!checkoutBtn || !checkoutSummary) return;

    checkoutBtn.addEventListener('click', async () => {
      checkoutSummary.innerHTML = '<div class="text-center py-4">Loading...</div>';
      if (checkoutConfirmBtn) checkoutConfirmBtn.disabled = true;
      const res = await window.request(`/api/cart/?t=${Date.now()}`);
      if (!res) return;
      const data = await res.json();

      const items = data.items || [];
      state.totalPrice = Number(data.total_price || 0);
      if (!items.length) {
        checkoutSummary.innerHTML = '<div class="text-muted">السلة فارغة.</div>';
        if (checkoutConfirmBtn) checkoutConfirmBtn.disabled = true;
        return;
      }

      const lines = items.map((i) => {
        const name = i.product_name || i?.product_item?.product_name || 'منتج';
        const qty = Number(i.qty || i.quantity || 1);
        const price = Number(i.price || i?.product_item?.price || 0);
        return `<div class="d-flex justify-content-between"><span>${escapeHtml(name)} × ${qty}</span><span>${formatCurrencyEGP(price * qty)}</span></div>`;
      }).join('');

      const profile = await loadProfileForCheckout();
      const addresses = profile?.addresses || [];
      const payments = profile?.payment_methods || [];

      state.selectedAddressId = pickDefaultId(addresses, 'is_default');
      state.selectedPaymentId = pickDefaultId(payments, 'is_default');

      const canConfirm = !!(state.selectedAddressId && state.selectedPaymentId);

      const addressOptions = addresses.length
        ? addresses.map((a) => {
            const id = String(a.id);
            const selected = id === String(state.selectedAddressId) ? 'selected' : '';
            const badge = a.is_default ? ' (افتراضي)' : '';
            return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(addressLabel(a) + badge)}</option>`;
          }).join('')
        : '<option value="">لا يوجد عناوين</option>';

      const paymentOptions = payments.length
        ? payments.map((p) => {
            const id = String(p.id);
            const selected = id === String(state.selectedPaymentId) ? 'selected' : '';
            const badge = p.is_default ? ' (افتراضي)' : '';
            return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(paymentLabel(p) + badge)}</option>`;
          }).join('')
        : '<option value="">لا يوجد طرق دفع</option>';

      checkoutSummary.innerHTML = `
        <div class="mb-3">
          ${lines}
          <hr>
          <div class="d-flex justify-content-between fw-bold"><span>الإجمالي</span><span>${formatCurrencyEGP(data.total_price || 0)}</span></div>
        </div>

        <div id="checkout-review" class="card border-0 shadow-sm p-3 mb-3" style="border-radius:14px;background:#f8fafc;">
          <div class="fw-bold mb-2" style="color:#0f172a;">مراجعة سريعة</div>
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <span class="badge rounded-pill" style="background:rgba(0,188,212,.12); color:#00BCD4; border:1px solid rgba(0,188,212,.35);">الشحن</span>
            <span id="checkout-review-address" class="small text-muted">—</span>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
            <span class="badge rounded-pill" style="background:rgba(14,165,233,.10); color:#0284c7; border:1px solid rgba(2,132,199,.25);">الدفع</span>
            <span id="checkout-review-payment" class="small text-muted">—</span>
          </div>
        </div>

        <div id="checkout-validation" class="alert alert-warning border-0 ${canConfirm ? 'd-none' : ''}" style="border-radius:14px;">
          لإتمام الطلب: اختر عنوان شحن وطريقة دفع (أو أضفهما من الملف الشخصي).
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold">عنوان الشحن</label>
          <select class="form-select" id="checkout-address" ${addresses.length ? '' : 'disabled'}>
            ${addressOptions}
          </select>
          ${addresses.length ? '' : '<div class="small text-muted mt-1">أضف عنواناً من الملف الشخصي لإتمام الطلب.</div>'}
        </div>

        <div class="mb-3">
          <label class="form-label fw-bold">طريقة الدفع</label>
          <select class="form-select" id="checkout-payment" ${payments.length ? '' : 'disabled'}>
            ${paymentOptions}
          </select>
          ${payments.length ? '' : '<div class="small text-muted mt-1">أضف طريقة دفع من الملف الشخصي لإتمام الطلب.</div>'}
        </div>

        ${(!addresses.length || !payments.length)
          ? `<div class="d-grid">
               <a class="btn btn-outline-info" href="/profile/?next=${encodeURIComponent('/cart/')}">إكمال بيانات الملف الشخصي</a>
             </div>`
          : ''}
      `;

      const addrSel = document.getElementById('checkout-address');
      const paySel = document.getElementById('checkout-payment');
      const validationEl = document.getElementById('checkout-validation');
      const reviewAddressEl = document.getElementById('checkout-review-address');
      const reviewPaymentEl = document.getElementById('checkout-review-payment');
      const footerSummaryEl = document.getElementById('checkout-footer-summary');
      const footerAddressEl = document.getElementById('checkout-footer-address');
      const footerPaymentEl = document.getElementById('checkout-footer-payment');
      const footerTotalEl = document.getElementById('checkout-footer-total');

      function syncReview() {
        const addr = addresses.find((a) => String(a.id) === String(state.selectedAddressId));
        const pay = payments.find((p) => String(p.id) === String(state.selectedPaymentId));

        if (reviewAddressEl) reviewAddressEl.textContent = addr ? addressLabel(addr) : '—';
        if (reviewPaymentEl) reviewPaymentEl.textContent = pay ? paymentLabel(pay) : '—';

        const addrText = addr ? addressLabel(addr) : '—';
        const payText = pay ? paymentLabel(pay) : '—';

        if (footerAddressEl) footerAddressEl.textContent = addrText;
        if (footerPaymentEl) footerPaymentEl.textContent = payText;
        if (footerTotalEl) footerTotalEl.textContent = formatCurrencyEGP(state.totalPrice);

        // Backward-compatible fallback (if template doesn't include the new spans)
        if (footerSummaryEl && (!footerAddressEl || !footerPaymentEl || !footerTotalEl)) {
          footerSummaryEl.textContent = `الشحن: ${addrText} | الدفع: ${payText} | الإجمالي: ${formatCurrencyEGP(state.totalPrice)}`;
        }
      }

      function syncConfirmState() {
        const ok = !!(state.selectedAddressId && state.selectedPaymentId);
        if (checkoutConfirmBtn) checkoutConfirmBtn.disabled = !ok;
        if (validationEl) validationEl.classList.toggle('d-none', ok);
        syncReview();
      }

      if (addrSel) {
        addrSel.addEventListener('change', () => {
          state.selectedAddressId = addrSel.value || null;
          syncConfirmState();
        });
      }
      if (paySel) {
        paySel.addEventListener('change', () => {
          state.selectedPaymentId = paySel.value || null;
          syncConfirmState();
        });
      }

      syncConfirmState();
    });
  }

  function bindCheckoutConfirm() {
    if (!checkoutConfirmBtn) return;

    checkoutConfirmBtn.addEventListener('click', async () => {
      try {
        checkoutConfirmBtn.disabled = true;
        checkoutConfirmBtn.dataset.prevHtml = checkoutConfirmBtn.innerHTML;
        checkoutConfirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> جاري التأكيد...';

        const payload = {};
        if (state.selectedAddressId) payload.shipping_address_id = state.selectedAddressId;
        if (state.selectedPaymentId) payload.payment_method_id = state.selectedPaymentId;

        const res = await window.request('/api/orders/', { method: 'POST', body: JSON.stringify(payload) });
        if (!res) return;

        if (res.ok) {
          showToast('تم إنشاء الطلب بنجاح!', 'success');
          await window.fetchCartFromApi();

          if (checkoutModal && window.bootstrap) {
            window.bootstrap.Modal.getInstance(checkoutModal)?.hide();
          }
        } else {
          const err = await res.json().catch(() => ({}));
          const detail = err?.detail;
          const fallback = 'فشل إتمام الطلب.';
          const msg = typeof detail === 'string' && detail.trim().length ? detail : fallback;
          showToast(msg, 'danger');

          // Backend requires Address + Payment Method; help the user recover.
          const hint = (typeof detail === 'string') ? detail.toLowerCase() : '';
          if (hint.includes('address') || hint.includes('payment')) {
            setTimeout(() => {
              const next = `${window.location.pathname || ''}${window.location.search || ''}` || '/api/cart/view/';
              window.location.href = `/profile/?next=${encodeURIComponent(next)}`;
            }, 900);
          }
        }
      } catch (e) {
        console.error('Checkout failed', e);
        showToast('تعذر الاتصال بالخادم.', 'danger');
      } finally {
        checkoutConfirmBtn.disabled = false;
        if (checkoutConfirmBtn.dataset.prevHtml) {
          checkoutConfirmBtn.innerHTML = checkoutConfirmBtn.dataset.prevHtml;
          delete checkoutConfirmBtn.dataset.prevHtml;
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');

    if (cartItemsContainer) {
      window.fetchCartFromApi();
      bindCheckoutModal();
      bindCheckoutConfirm();
    }
  });
})();
