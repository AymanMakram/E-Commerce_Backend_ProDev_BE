// frontend/frontend/js/seller_dashboard.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const addForm = byId('add-product-form');
  const productsList = byId('products-list');
  const loader = byId('loader');
  const paginationEl = byId('seller-pagination');

  const filterSearch = byId('seller-product-search');
  const filterCategory = byId('seller-product-filter-category');
  const filterReset = byId('seller-product-filter-reset');
  const productsMeta = byId('seller-products-meta');

  let filterDebounceId = null;

  const addName = byId('product-name');
  const addCategory = byId('product-category');
  const addDescription = byId('product-description');
  const addImage = byId('product-image');

  const editModalEl = byId('editProductModal');
  const editForm = byId('edit-product-form');
  const editId = byId('edit-product-id');
  const editName = byId('edit-product-name');
  const editCategory = byId('edit-product-category');
  const editDescription = byId('edit-product-description');
  const editImage = byId('edit-product-image');
  const saveEditBtn = byId('save-edit-btn');

  const itemModalEl = byId('productItemModal');
  const itemForm = byId('product-item-form');
  const itemId = byId('product-item-id');
  const itemProductId = byId('product-item-product-id');
  const itemSku = byId('product-item-sku');
  const itemQty = byId('product-item-qty');
  const itemPrice = byId('product-item-price');
  const itemImage = byId('product-item-image');
  const itemSaveBtn = byId('save-item-btn');

  const skuOptionsModalEl = byId('skuOptionsModal');
  const skuOptionsItemId = byId('sku-options-item-id');
  const skuOptionsProductId = byId('sku-options-product-id');
  const skuOptionsContainer = byId('sku-options-container');
  const skuOptionsAlert = byId('sku-options-alert');
  const skuOptionsSaveBtn = byId('sku-options-save');

  const variationsCache = new Map(); // categoryId -> [{id,name,category,..., options:[{id,value,variation_name}]}]

  const DEFAULT_IMAGE = '/static/images/no-image.svg';

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  function setSkuOptionsAlert(message, type = 'info') {
    if (!skuOptionsAlert) return;
    if (!message) {
      skuOptionsAlert.className = 'alert d-none mt-3 mb-0';
      skuOptionsAlert.textContent = '';
      skuOptionsAlert.classList.add('d-none');
      return;
    }
    skuOptionsAlert.className = `alert alert-${type} mt-3 mb-0`;
    skuOptionsAlert.textContent = message;
    skuOptionsAlert.classList.remove('d-none');
  }

  async function readJsonSafe(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function setButtonLoading(button, isLoading, label) {
    if (!button) return;
    if (isLoading) {
      button.disabled = true;
      button.dataset.prevHtml = button.innerHTML;
      button.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> جاري التنفيذ...`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.prevHtml || button.innerHTML;
      if (label) button.textContent = label;
    }
  }

  function normalizeImgUrl(path) {
    const url = (typeof window.normalizeMediaUrl === 'function') ? window.normalizeMediaUrl(path) : path;
    return url || DEFAULT_IMAGE;
  }

  function getPaginatedResults(data) {
    if (!data) return { results: [], next: null, previous: null, count: 0 };
    if (Array.isArray(data)) return { results: data, next: null, previous: null, count: data.length };
    const results = Array.isArray(data.results) ? data.results : [];
    return { results, next: data.next || null, previous: data.previous || null, count: Number(data.count) || results.length };
  }

  function truncate(text, max = 120) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  }

  async function loadCategoriesInto(selectEl) {
    if (!selectEl || typeof window.request !== 'function') return;

    const res = await window.request('/api/categories/?page_size=200');
    if (!res) return;
    const data = await readJsonSafe(res);

    const { results } = getPaginatedResults(data);

    selectEl.innerHTML = '<option value="">اختر الفئة</option>';
    results.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.category_name;
      selectEl.appendChild(opt);
    });
  }

  function renderPagination({ next, previous }) {
    if (!paginationEl) return;
    if (!next && !previous) {
      paginationEl.innerHTML = '';
      return;
    }

    paginationEl.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button type="button" class="btn btn-outline-secondary rounded-pill" id="seller-prev" ${previous ? '' : 'disabled'}>السابق</button>
        <button type="button" class="btn btn-outline-info rounded-pill" id="seller-next" ${next ? '' : 'disabled'} style="border-color:#00BCD4;color:#00BCD4;">التالي</button>
      </div>
    `;

    const prevBtn = byId('seller-prev');
    const nextBtn = byId('seller-next');

    prevBtn?.addEventListener('click', () => loadProducts(previous));
    nextBtn?.addEventListener('click', () => loadProducts(next));
  }

  function setProductsMeta(text) {
    if (!productsMeta) return;
    productsMeta.textContent = text || '';
  }

  function buildProductsUrl(base = '/api/products/') {
    try {
      const url = new URL(base, window.location.origin);
      const q = String(filterSearch?.value || '').trim();
      const category = String(filterCategory?.value || '').trim();

      if (q) url.searchParams.set('search', q);
      else url.searchParams.delete('search');

      if (category) url.searchParams.set('category', category);
      else url.searchParams.delete('category');

      return url.pathname + url.search;
    } catch (_) {
      return base;
    }
  }

  function productCardHtml(p) {
        const isPublished = (p && typeof p.is_published !== 'undefined') ? Boolean(p.is_published) : true;
        const pubBadge = isPublished
          ? '<span class="badge rounded-pill bg-success">منشور</span>'
          : '<span class="badge rounded-pill bg-secondary">غير منشور</span>';
        const pubBtn = isPublished
          ? `<button class="btn btn-sm btn-outline-secondary rounded-pill" data-action="product-unpublish" data-id="${p.id}">إخفاء</button>`
          : `<button class="btn btn-sm btn-outline-info rounded-pill" data-action="product-publish" data-id="${p.id}" style="border-color:#00BCD4;color:#00BCD4;">نشر</button>`;
    const img = normalizeImgUrl(p.product_image);
    const items = Array.isArray(p.items) ? p.items : [];

    const itemsHtml = items.length
      ? `
        <div class="mt-3">
          <div class="d-flex justify-content-between align-items-center">
            <div class="fw-bold small" style="color:#0f172a;">المخزون / الـ SKU</div>
            <button class="btn btn-sm btn-outline-info rounded-pill" data-action="item-add" data-product-id="${p.id}" style="border-color:#00BCD4;color:#00BCD4;">إضافة SKU</button>
          </div>
          <div class="table-responsive mt-2">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr class="text-muted small">
                  <th>SKU</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th class="text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((it) => `
                  <tr>
                    <td>${it.sku || ''}</td>
                    <td>${Number(it.qty_in_stock ?? 0)}</td>
                    <td>${it.price ?? ''}</td>
                    <td class="text-end">
                      <button class="btn btn-sm btn-outline-info rounded-pill" data-action="item-options" data-item-id="${it.id}" data-product-id="${p.id}" style="border-color:#00BCD4;color:#00BCD4;">الخيارات</button>
                      <button class="btn btn-sm btn-outline-secondary rounded-pill" data-action="item-edit" data-item-id="${it.id}" data-product-id="${p.id}">تعديل</button>
                      <button class="btn btn-sm btn-outline-danger rounded-pill" data-action="item-delete" data-item-id="${it.id}">حذف</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `
      : `
        <div class="mt-3 d-flex justify-content-between align-items-center">
          <div class="text-muted small">لا توجد عناصر (SKU) بعد.</div>
          <button class="btn btn-sm btn-outline-info rounded-pill" data-action="item-add" data-product-id="${p.id}" style="border-color:#00BCD4;color:#00BCD4;">إضافة SKU</button>
        </div>
      `;

    return `
      <div class="col-md-6 col-lg-4 mb-4" data-product-card="${p.id}">
        <div class="card h-100 shadow-sm" style="border-radius:16px; overflow:hidden;">
          <div style="height:180px; background:#f8fafc;">
            <img src="${img}" alt="${p.name || 'Product'}" style="width:100%;height:180px;object-fit:cover;" onerror="this.src='${DEFAULT_IMAGE}'" />
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <h5 class="card-title mb-1" style="color:#0f172a;">${p.name || ''}</h5>
                <div class="text-muted small">${p.category_name || ''}</div>
                <div class="mt-2">${pubBadge}</div>
              </div>
              <div class="d-flex flex-column gap-2">
                <button class="btn btn-sm btn-outline-secondary rounded-pill" data-action="product-edit" data-id="${p.id}">تعديل</button>
                ${pubBtn}
                <button class="btn btn-sm btn-outline-danger rounded-pill" data-action="product-delete" data-id="${p.id}">حذف</button>
              </div>
            </div>
            <p class="text-muted small mt-2 mb-0">${truncate(p.description, 140)}</p>
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function bindProductActions(products) {
    if (!productsList) return;

    async function togglePublish(productId, nextState) {
      const res = await window.request(`/api/products/${productId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: !!nextState }),
      });
      if (!res) return;
      if (res.ok) {
        showToast(nextState ? 'تم نشر المنتج.' : 'تم إخفاء المنتج.', 'success');
        await loadProducts('/api/products/');
      } else {
        const err = await readJsonSafe(res);
        showToast((err && (err.detail || err.message)) || 'فشل تحديث حالة النشر.', 'danger');
      }
    }

    productsList.querySelectorAll('[data-action="product-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const p = (products || []).find((x) => String(x.id) === String(id));
        if (p) openEditProductModal(p);
      });
    });

    productsList.querySelectorAll('[data-action="product-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('هل تريد حذف المنتج؟')) return;

        const res = await window.request(`/api/products/${id}/`, { method: 'DELETE' });
        if (!res) return;
        if (res.ok) {
          showToast('تم حذف المنتج.', 'info');
          await loadProducts('/api/products/');
        } else {
          const err = await readJsonSafe(res);
          showToast((err && (err.detail || err.message)) || 'فشل حذف المنتج.', 'danger');
        }
      });
    });

    productsList.querySelectorAll('[data-action="product-publish"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        await togglePublish(id, true);
      });
    });

    productsList.querySelectorAll('[data-action="product-unpublish"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        await togglePublish(id, false);
      });
    });

    productsList.querySelectorAll('[data-action="item-add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const productId = btn.getAttribute('data-product-id');
        openItemModalForCreate(productId);
      });
    });

    productsList.querySelectorAll('[data-action="item-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const productId = btn.getAttribute('data-product-id');
        const itemIdVal = btn.getAttribute('data-item-id');
        const product = (products || []).find((x) => String(x.id) === String(productId));
        const item = product?.items?.find((it) => String(it.id) === String(itemIdVal));
        if (item) openItemModalForEdit(productId, item);
      });
    });

    productsList.querySelectorAll('[data-action="item-options"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const productId = btn.getAttribute('data-product-id');
        const itemIdVal = btn.getAttribute('data-item-id');
        const product = (products || []).find((x) => String(x.id) === String(productId));
        const item = product?.items?.find((it) => String(it.id) === String(itemIdVal));
        if (!product || !item) return;
        await openSkuOptionsModal(product, item);
      });
    });

    productsList.querySelectorAll('[data-action="item-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-item-id');
        if (!id) return;
        if (!confirm('هل تريد حذف عنصر SKU؟')) return;

        const res = await window.request(`/api/product-items/${id}/`, { method: 'DELETE' });
        if (!res) return;
        if (res.ok) {
          showToast('تم حذف عنصر SKU.', 'info');
          await loadProducts('/api/products/');
        } else {
          const err = await readJsonSafe(res);
          showToast((err && (err.detail || err.message)) || 'فشل الحذف.', 'danger');
        }
      });
    });
  }

  async function fetchVariationsWithOptions(categoryId) {
    const key = String(categoryId || '');
    if (!key) return [];
    if (variationsCache.has(key)) return variationsCache.get(key);

    const res = await window.request(`/api/variations/?category=${encodeURIComponent(key)}`);
    if (!res) return [];
    const vars = await readJsonSafe(res);
    const list = Array.isArray(vars?.results) ? vars.results : (Array.isArray(vars) ? vars : []);

    const enriched = [];
    for (const v of list) {
      const optRes = await window.request(`/api/variations/${v.id}/options/`);
      const opts = optRes ? (await readJsonSafe(optRes)) : [];
      enriched.push({ ...v, options: Array.isArray(opts) ? opts : [] });
    }

    variationsCache.set(key, enriched);
    return enriched;
  }

  function renderSkuOptionsForm(variations, currentOptionsByVariationName) {
    if (!skuOptionsContainer) return;
    if (!Array.isArray(variations) || !variations.length) {
      skuOptionsContainer.innerHTML = '<div class="text-muted">لا توجد اختلافات مرتبطة بهذه الفئة حالياً.</div>';
      return;
    }

    skuOptionsContainer.innerHTML = `
      <div class="row g-3">
        ${variations
          .map((v) => {
            const varName = String(v.name || 'Variation');
            const opts = Array.isArray(v.options) ? v.options : [];
            const selectedId = currentOptionsByVariationName?.get(varName) || '';
            return `
              <div class="col-12 col-md-6">
                <label class="form-label fw-bold">${varName}</label>
                <select class="form-select" data-sku-var="${varName}">
                  <option value="">—</option>
                  ${opts
                    .map((o) => {
                      const sel = String(o.id) === String(selectedId) ? 'selected' : '';
                      return `<option value="${o.id}" ${sel}>${o.value}</option>`;
                    })
                    .join('')}
                </select>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  async function openSkuOptionsModal(product, item) {
    if (!skuOptionsModalEl) return;
    setSkuOptionsAlert('', 'info');

    if (skuOptionsItemId) skuOptionsItemId.value = String(item.id || '');
    if (skuOptionsProductId) skuOptionsProductId.value = String(product.id || '');

    const current = new Map();
    (item?.options || []).forEach((o) => {
      if (!o?.variation_name) return;
      current.set(String(o.variation_name), String(o.id));
    });

    if (skuOptionsContainer) skuOptionsContainer.innerHTML = '<div class="text-muted">جاري تحميل الاختلافات...</div>';

    const variations = await fetchVariationsWithOptions(product.category);
    renderSkuOptionsForm(variations, current);

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(skuOptionsModalEl) : null;
    modal?.show();
  }

  function bindSkuOptionsSave() {
    if (!skuOptionsSaveBtn || typeof window.request !== 'function') return;
    skuOptionsSaveBtn.addEventListener('click', async () => {
      const itemIdVal = String(skuOptionsItemId?.value || '').trim();
      if (!itemIdVal) return;

      setSkuOptionsAlert('', 'info');
      skuOptionsSaveBtn.disabled = true;
      const prev = skuOptionsSaveBtn.innerHTML;
      skuOptionsSaveBtn.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> حفظ`;

      try {
        const selected = [];
        skuOptionsContainer?.querySelectorAll('select[data-sku-var]')?.forEach((sel) => {
          const v = String(sel.value || '').trim();
          if (v) selected.push(Number(v));
        });

        const res = await window.request(`/api/product-items/${itemIdVal}/options/`, {
          method: 'PUT',
          body: JSON.stringify({ variation_option_ids: selected }),
        });
        if (!res) return;
        const data = await readJsonSafe(res);
        if (!res.ok) {
          setSkuOptionsAlert((data && (data.detail || data.error)) || 'فشل حفظ الخيارات.', 'danger');
          return;
        }

        showToast('تم حفظ خيارات الـ SKU.', 'success');
        const modal = (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal.getOrCreateInstance(skuOptionsModalEl) : null;
        modal?.hide();
        await loadProducts('/api/products/');
      } catch (e) {
        console.error('save sku options failed', e);
        setSkuOptionsAlert('تعذر الاتصال بالخادم.', 'danger');
      } finally {
        skuOptionsSaveBtn.disabled = false;
        skuOptionsSaveBtn.innerHTML = prev;
      }
    });
  }

  function openEditProductModal(product) {
    if (!editModalEl || !editForm) return;

    editId.value = product.id;
    editName.value = product.name || '';
    editDescription.value = product.description || '';
    if (editCategory) editCategory.value = product.category || '';
    if (editImage) editImage.value = '';

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(editModalEl) : null;
    modal?.show();
  }

  function openItemModalForCreate(productId) {
    if (!itemModalEl || !itemForm) return;

    itemForm.reset();
    itemId.value = '';
    itemProductId.value = String(productId || '');

    const title = itemModalEl.querySelector('.modal-title');
    if (title) title.textContent = 'إضافة SKU';

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(itemModalEl) : null;
    modal?.show();
  }

  function openItemModalForEdit(productId, item) {
    if (!itemModalEl || !itemForm) return;

    itemForm.reset();
    itemId.value = String(item.id || '');
    itemProductId.value = String(productId || '');

    itemSku.value = item.sku || '';
    itemQty.value = String(item.qty_in_stock ?? 0);
    itemPrice.value = String(item.price ?? '');
    if (itemImage) itemImage.value = '';

    const title = itemModalEl.querySelector('.modal-title');
    if (title) title.textContent = 'تعديل SKU';

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(itemModalEl) : null;
    modal?.show();
  }

  async function loadProducts(url = '/api/products/') {
    if (typeof window.request !== 'function') return;

    if (loader) loader.classList.remove('d-none');
    if (productsList) {
      productsList.innerHTML = `
        <div class="col-12">
          <div class="card border-0 shadow-sm p-4" style="border-radius:16px;">
            <div class="text-muted">جاري تحميل المنتجات...</div>
          </div>
        </div>
      `;
    }

    const finalUrl = /^https?:\/\//i.test(url) ? url : buildProductsUrl(url);
    const res = await window.request(finalUrl);
    if (!res) return;

    const data = await readJsonSafe(res);
    const { results, next, previous, count } = getPaginatedResults(data);

    if (loader) loader.classList.add('d-none');

    if (!productsList) return;

    if (!results.length) {
      productsList.innerHTML = `
        <div class="col-12">
          <div class="card border-0 shadow-sm p-4" style="border-radius:16px;">
            <div class="fw-bold" style="color:#0f172a;">لا توجد منتجات بعد</div>
            <div class="text-muted">ابدأ بإضافة منتج جديد من النموذج بالأعلى.</div>
          </div>
        </div>
      `;
      renderPagination({ next: null, previous: null });
      setProductsMeta('لا توجد نتائج مطابقة.');
      return;
    }

    productsList.innerHTML = results.map(productCardHtml).join('');
    bindProductActions(results);
    renderPagination({ next, previous });

    if (count) setProductsMeta(`إجمالي ${count} — المعروض ${results.length}`);
    else setProductsMeta(`المعروض ${results.length}`);
  }

  function bindFilters() {
    if (filterReset) {
      filterReset.addEventListener('click', async () => {
        if (filterSearch) filterSearch.value = '';
        if (filterCategory) filterCategory.value = '';
        setProductsMeta('');
        await loadProducts('/api/products/');
      });
    }

    if (filterCategory) {
      filterCategory.addEventListener('change', async () => {
        setProductsMeta('');
        await loadProducts('/api/products/');
      });
    }

    if (filterSearch) {
      filterSearch.addEventListener('input', () => {
        clearTimeout(filterDebounceId);
        filterDebounceId = setTimeout(async () => {
          setProductsMeta('');
          await loadProducts('/api/products/');
        }, 300);
      });
    }
  }

  function buildProductFormData({ name, description, category, imageFile }) {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    fd.append('category', category);
    if (imageFile) fd.append('product_image', imageFile);
    return fd;
  }

  function buildItemFormData({ productId, sku, qty, price, imageFile }) {
    const fd = new FormData();
    fd.append('product', String(productId));
    fd.append('sku', sku);
    fd.append('qty_in_stock', String(qty));
    fd.append('price', String(price));
    if (imageFile) fd.append('product_image', imageFile);
    return fd;
  }

  function bindAddProduct() {
    if (!addForm || typeof window.request !== 'function') return;

    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = String(addName?.value || '').trim();
      const category = String(addCategory?.value || '').trim();
      const description = String(addDescription?.value || '').trim();
      const imageFile = addImage?.files?.[0] || null;

      if (!name || !category || !description) {
        showToast('يرجى تعبئة اسم المنتج والفئة والوصف.', 'danger');
        return;
      }

      const fd = buildProductFormData({ name, description, category, imageFile });

      setButtonLoading(addForm.querySelector('button[type="submit"]'), true);
      const res = await window.request('/api/products/', { method: 'POST', body: fd });
      setButtonLoading(addForm.querySelector('button[type="submit"]'), false);

      if (!res) return;
      if (res.ok) {
        showToast('تمت إضافة المنتج.', 'success');
        addForm.reset();
        await loadProducts('/api/products/');
      } else {
        const err = await readJsonSafe(res);
        showToast((err && (err.detail || err.name?.[0] || err.category?.[0])) || 'فشل إضافة المنتج.', 'danger');
      }
    });
  }

  function bindEditProduct() {
    if (!saveEditBtn || typeof window.request !== 'function') return;

    saveEditBtn.addEventListener('click', async () => {
      const id = String(editId?.value || '').trim();
      if (!id) return;

      const name = String(editName?.value || '').trim();
      const category = String(editCategory?.value || '').trim();
      const description = String(editDescription?.value || '').trim();
      const imageFile = editImage?.files?.[0] || null;

      if (!name || !category || !description) {
        showToast('يرجى تعبئة اسم المنتج والفئة والوصف.', 'danger');
        return;
      }

      const fd = buildProductFormData({ name, description, category, imageFile });

      setButtonLoading(saveEditBtn, true);
      const res = await window.request(`/api/products/${id}/`, { method: 'PATCH', body: fd });
      setButtonLoading(saveEditBtn, false);

      if (!res) return;
      if (res.ok) {
        showToast('تم تحديث المنتج.', 'success');
        const modal = (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal.getOrCreateInstance(editModalEl) : null;
        modal?.hide();
        await loadProducts('/api/products/');
      } else {
        const err = await readJsonSafe(res);
        showToast((err && (err.detail || err.name?.[0] || err.category?.[0])) || 'فشل التحديث.', 'danger');
      }
    });
  }

  function bindItemSave() {
    if (!itemSaveBtn || !itemForm || typeof window.request !== 'function') return;

    itemForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = String(itemId?.value || '').trim();
      const productId = String(itemProductId?.value || '').trim();
      const sku = String(itemSku?.value || '').trim();
      const qty = Number(itemQty?.value || 0);
      const price = String(itemPrice?.value || '').trim();
      const imageFile = itemImage?.files?.[0] || null;

      if (!productId || !sku || !Number.isFinite(qty) || qty < 0 || !price) {
        showToast('يرجى تعبئة SKU والكمية والسعر.', 'danger');
        return;
      }

      setButtonLoading(itemSaveBtn, true);

      const res = id
        ? await window.request(`/api/product-items/${id}/`, {
            method: 'PATCH',
            body: (() => {
              const fd = new FormData();
              fd.append('sku', sku);
              fd.append('qty_in_stock', String(qty));
              fd.append('price', String(price));
              if (imageFile) fd.append('product_image', imageFile);
              return fd;
            })(),
          })
        : await window.request('/api/product-items/', {
            method: 'POST',
            body: buildItemFormData({ productId, sku, qty, price, imageFile }),
          });

      setButtonLoading(itemSaveBtn, false);

      if (!res) return;
      if (res.ok) {
        showToast(id ? 'تم تحديث SKU.' : 'تمت إضافة SKU.', 'success');
        const modal = (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal.getOrCreateInstance(itemModalEl) : null;
        modal?.hide();
        await loadProducts('/api/products/');
      } else {
        const err = await readJsonSafe(res);
        showToast((err && (err.detail || err.sku?.[0] || err.price?.[0] || err.qty_in_stock?.[0] || err.product?.[0])) || 'فشل حفظ SKU.', 'danger');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');

    await loadCategoriesInto(addCategory);
    await loadCategoriesInto(editCategory);
    await loadCategoriesInto(filterCategory);

    bindAddProduct();
    bindEditProduct();
    bindItemSave();
    bindFilters();
    bindSkuOptionsSave();

    await loadProducts('/api/products/');
  });
})();
