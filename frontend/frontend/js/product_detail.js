// frontend/frontend/js/product_detail.js

(function () {
  'use strict';

  const root = document.getElementById('product-detail-root');
  const skeleton = document.getElementById('product-detail-skeleton');
  const content = document.getElementById('product-detail-content');

  const DEFAULT_IMAGE = '/static/images/no-image.svg';

  const state = {
    product: null,
    selectedItem: null,
    selectedOptions: {},
    mainImage: DEFAULT_IMAGE,
  };

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  function redirectToLogin() {
    const next = `${window.location.pathname || ''}${window.location.search || ''}`;
    const safeNext = (next && next.startsWith('/')) ? next : '/products/';
    window.location.replace(`/api/accounts/login-view/?next=${encodeURIComponent(safeNext)}`);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function normalizeImageUrl(path) {
    if (!path) return DEFAULT_IMAGE;
    if (typeof window.normalizeMediaUrl === 'function') {
      const u = window.normalizeMediaUrl(path);
      return u || DEFAULT_IMAGE;
    }
    if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
    return '/' + path;
  }

  function uniqueImages(urls) {
    const seen = new Set();
    return (urls || []).filter((u) => {
      const v = String(u || '').trim();
      if (!v) return false;
      const key = v;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildOptionsMap(items) {
    const map = new Map();
    (items || []).forEach((item) => {
      (item.options || []).forEach((opt) => {
        const varName = opt.variation_name || 'Option';
        const value = opt.value;
        if (!map.has(varName)) map.set(varName, new Set());
        map.get(varName).add(value);
      });
    });

    const out = {};
    for (const [k, set] of map.entries()) {
      out[k] = Array.from(set).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    }
    return out;
  }

  function itemMatchesSelectedOptions(item, selectedOptions) {
    const entries = Object.entries(selectedOptions || {});
    if (!entries.length) return true;

    const itemOpts = Array.isArray(item?.options) ? item.options : [];
    return entries.every(([varName, value]) => itemOpts.some((o) => o.variation_name === varName && o.value === value));
  }

  function findBestMatchingItem(items, selectedOptions) {
    const list = Array.isArray(items) ? items : [];
    return list.find((it) => itemMatchesSelectedOptions(it, selectedOptions)) || list[0] || null;
  }

  function setMainImage(url) {
    state.mainImage = url || DEFAULT_IMAGE;
    const img = document.getElementById('product-main-image');
    if (img) img.src = state.mainImage;

    document.querySelectorAll('[data-thumb]')?.forEach((el) => {
      el.classList.toggle('border-info', el.getAttribute('data-thumb') === state.mainImage);
    });
  }

  function updateSelectedItemUI() {
    const item = state.selectedItem;
    const priceEl = document.getElementById('product-price');
    const stockEl = document.getElementById('product-stock');
    const skuEl = document.getElementById('product-sku');
    const addBtn = document.getElementById('product-add');
    const qtyInput = document.getElementById('product-qty');

    const price = Number(item?.price || 0);
    const stock = Number(item?.qty_in_stock ?? 0);
    const sku = item?.sku || '—';

    if (priceEl) priceEl.textContent = price.toFixed(2) + ' ج.م';
    if (skuEl) skuEl.textContent = sku;

    if (stockEl) {
      if (Number.isFinite(stock) && stock > 0) {
        stockEl.className = 'badge bg-success';
        stockEl.textContent = `متوفر (${stock})`;
      } else {
        stockEl.className = 'badge bg-danger';
        stockEl.textContent = 'غير متوفر';
      }
    }

    if (qtyInput) {
      qtyInput.max = String(Number.isFinite(stock) && stock > 0 ? stock : 1);
      if (Number(qtyInput.value || 1) < 1) qtyInput.value = '1';
    }

    if (addBtn) {
      addBtn.disabled = !(Number.isFinite(stock) && stock > 0);
    }
  }

  function render(product) {
    if (!content) return;

    const name = escapeHtml(product?.name || 'منتج');
    const desc = escapeHtml(product?.description || '');
    const seller = escapeHtml(product?.seller_name || '');
    const category = escapeHtml(product?.category_name || '');

    const items = Array.isArray(product?.items) ? product.items : [];
    const optionsMap = buildOptionsMap(items);

    const rawImages = [product?.product_image, ...items.map((i) => i.product_image)].map(normalizeImageUrl);
    const images = uniqueImages(rawImages);
    const main = images[0] || DEFAULT_IMAGE;
    state.mainImage = main;

    const hasVariations = Object.keys(optionsMap).length > 0;

    const optionControls = hasVariations
      ? Object.entries(optionsMap).map(([varName, values]) => {
          const opts = values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
          const safeId = 'opt-' + btoa(unescape(encodeURIComponent(varName))).replace(/=+/g, '');
          return `
            <div class="col-md-6">
              <label class="form-label fw-bold">${escapeHtml(varName)}</label>
              <select class="form-select" id="${safeId}" data-variation="${escapeHtml(varName)}">${opts}</select>
            </div>`;
        }).join('')
      : `
        <div class="col-md-6">
          <label class="form-label fw-bold">القطعة (SKU)</label>
          <select class="form-select" id="sku-select">
            ${items.map((i) => `<option value="${i.id}">${escapeHtml(i.sku || ('SKU ' + i.id))}</option>`).join('')}
          </select>
        </div>`;

    content.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card border-0 shadow-sm" style="border-radius: 18px; overflow: hidden; background: #f1f5f9;">
            <img id="product-main-image" src="${main}" alt="${name}" style="width:100%; height:360px; object-fit:contain; background:#f1f5f9;" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE}';" />
          </div>
          <div class="d-flex gap-2 mt-3 flex-wrap">
            ${images.map((u) => `
              <button type="button" class="btn p-0 border ${u === main ? 'border-info' : 'border-light'}" data-thumb="${u}" style="border-radius: 14px; width: 74px; height: 74px; overflow: hidden; background:#fff;">
                <img src="${u}" alt="" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE}';" />
              </button>`).join('')}
          </div>
        </div>

        <div class="col-lg-7">
          <div class="card border-0 shadow-sm p-4" style="border-radius: 18px;">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div>
                <div class="text-muted small">${category}${seller ? ` · البائع: ${seller}` : ''}</div>
                <h2 class="fw-bold mt-1">${name}</h2>
              </div>
              <div class="text-end">
                <div id="product-price" class="fw-bold" style="color:#00BCD4; font-size: 1.35rem;"></div>
                <div class="mt-2">
                  <span id="product-stock" class="badge bg-secondary">—</span>
                </div>
              </div>
            </div>

            <p class="text-muted mt-3" style="white-space: pre-wrap;">${desc}</p>

            <div class="mt-3">
              <div class="row g-3">${optionControls}</div>
            </div>

            <div class="d-flex align-items-center gap-3 mt-4">
              <div>
                <label class="form-label fw-bold">الكمية</label>
                <input id="product-qty" type="number" class="form-control" min="1" value="1" style="max-width: 140px;">
              </div>
              <div class="flex-grow-1">
                <label class="form-label fw-bold">SKU</label>
                <div class="form-control" style="background:#f8fafc;"> <span id="product-sku">—</span> </div>
              </div>
            </div>

            <div class="d-flex gap-2 mt-4">
              <button id="product-add" class="btn btn-info rounded-pill flex-grow-1">
                <i class="fa-solid fa-cart-plus ms-2"></i> أضف للسلة
              </button>
              <a id="product-cart-link" href="/cart/" class="btn btn-outline-info rounded-pill">السلة</a>
            </div>
          </div>
        </div>
      </div>
    `;

    content.classList.remove('d-none');
    if (skeleton) skeleton.classList.add('d-none');

    // Guest UX: make "Add to cart" clearly require login.
    const token = (() => { try { return localStorage.getItem('access_token'); } catch (_) { return null; } })();
    const addBtnGuest = document.getElementById('product-add');
    if (addBtnGuest && !token) {
      addBtnGuest.classList.remove('btn-info');
      addBtnGuest.classList.add('btn-outline-secondary');
      addBtnGuest.title = 'سجّل الدخول لإضافة للسلة';
      addBtnGuest.setAttribute('aria-label', addBtnGuest.title);
      addBtnGuest.innerHTML = '<i class="fa fa-lock ms-2"></i> سجّل الدخول للإضافة';
    }

    const cartLink = document.getElementById('product-cart-link');
    if (cartLink && !token) {
      cartLink.href = '/api/accounts/login-view/?next=%2Fcart%2F';
      cartLink.title = 'سجّل الدخول لعرض السلة';
      cartLink.setAttribute('aria-label', cartLink.title);
    }

    // Bind thumbnails
    document.querySelectorAll('[data-thumb]')?.forEach((btn) => {
      btn.addEventListener('click', () => setMainImage(btn.getAttribute('data-thumb')));
    });

    // Initialize selection
    state.selectedOptions = {};
    if (hasVariations) {
      Object.entries(optionsMap).forEach(([varName, values]) => {
        if (values.length) state.selectedOptions[varName] = values[0];
      });
      state.selectedItem = findBestMatchingItem(items, state.selectedOptions);

      document.querySelectorAll('select[data-variation]')?.forEach((sel) => {
        const varName = sel.getAttribute('data-variation');
        sel.value = state.selectedOptions[varName] || sel.value;
        sel.addEventListener('change', () => {
          state.selectedOptions[varName] = sel.value;
          state.selectedItem = findBestMatchingItem(items, state.selectedOptions);
          updateSelectedItemUI();
        });
      });
    } else {
      const skuSel = document.getElementById('sku-select');
      state.selectedItem = items[0] || null;
      if (skuSel) {
        skuSel.value = String(state.selectedItem?.id || skuSel.value);
        skuSel.addEventListener('change', () => {
          const id = Number(skuSel.value);
          state.selectedItem = items.find((it) => Number(it.id) === id) || items[0] || null;
          updateSelectedItemUI();
        });
      }
    }

    updateSelectedItemUI();

    // Add to cart
    const addBtn = document.getElementById('product-add');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const token = (() => { try { return localStorage.getItem('access_token'); } catch (_) { return null; } })();
        if (!token) {
          showToast('سجّل الدخول لإضافة المنتجات إلى السلة.', 'info');
          redirectToLogin();
          return;
        }
        const item = state.selectedItem;
        if (!item?.id) return;

        const qtyInput = document.getElementById('product-qty');
        const desiredQty = Math.max(1, parseInt(qtyInput?.value || '1', 10) || 1);

        addBtn.disabled = true;
        const prev = addBtn.innerHTML;
        addBtn.innerHTML = '<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> جاري الإضافة...';

        try {
          const res = await window.request('/api/cart/cart-items/', {
            method: 'POST',
            body: JSON.stringify({ product_item: item.id, quantity: desiredQty }),
          });
          if (!res) return;

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err?.detail || 'فشل إضافة المنتج للسلة.', 'danger');
            return;
          }

          showToast('تمت الإضافة للسلة.', 'success');

          const cartRes = await window.request(`/api/cart/?t=${Date.now()}`);
          if (cartRes && cartRes.ok) {
            const cart = await cartRes.json().catch(() => ({}));
            const count = (cart.items || []).reduce((sum, it) => sum + (parseInt(it.qty || it.quantity || 0, 10) || 0), 0);
            if (window.VeloState) window.VeloState.setCartCount(count);
          }
        } catch (e) {
          console.error('Add to cart failed', e);
          showToast('تعذر الاتصال بالخادم.', 'danger');
        } finally {
          addBtn.disabled = false;
          addBtn.innerHTML = prev;
        }
      });
    }
  }

  async function init() {
    if (!root || typeof window.request !== 'function') return;

    const productId = root.getAttribute('data-product-id');
    if (!productId) return;

    try {
      const res = await window.request(`/api/products/${productId}/`);
      if (!res) return;

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err?.detail || 'تعذر تحميل بيانات المنتج.', 'danger');
        return;
      }

      const data = await res.json();
      state.product = data;
      render(data);
    } catch (e) {
      console.error('Product detail load failed', e);
      showToast('تعذر الاتصال بالخادم.', 'danger');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
