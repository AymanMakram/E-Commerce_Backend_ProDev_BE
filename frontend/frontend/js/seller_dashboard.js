// frontend/frontend/js/seller_dashboard.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const addForm = byId('add-product-form');
  const productsList = byId('products-list');
  const loader = byId('loader');
  const paginationEl = byId('seller-pagination');

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

  const DEFAULT_IMAGE = '/static/images/no-image.svg';

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

  function productCardHtml(p) {
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
              </div>
              <div class="d-flex flex-column gap-2">
                <button class="btn btn-sm btn-outline-secondary rounded-pill" data-action="product-edit" data-id="${p.id}">تعديل</button>
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

    const res = await window.request(url);
    if (!res) return;

    const data = await readJsonSafe(res);
    const { results, next, previous } = getPaginatedResults(data);

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
      return;
    }

    productsList.innerHTML = results.map(productCardHtml).join('');
    bindProductActions(results);
    renderPagination({ next, previous });
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

    bindAddProduct();
    bindEditProduct();
    bindItemSave();

    await loadProducts('/api/products/');
  });
})();
