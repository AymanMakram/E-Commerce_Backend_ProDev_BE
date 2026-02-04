// frontend/frontend/js/products.js

(function () {
  'use strict';

  const grid = document.getElementById('products-grid');
  const categoryBar = document.getElementById('category-bar');
  const searchInput = document.getElementById('product-search');
  const paginationUl = document.getElementById('pagination-controls');

  const PAGE_SIZE = 20;
  let debounceTimer;

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  const esc = (v) => (typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? ''));

  function renderSkeletons(count = 8) {
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
      grid.innerHTML += `
        <div class="col-md-4 col-lg-3 mb-4">
          <div class="card p-3 h-100 shadow-sm border-0" style="border-radius: 20px;">
            <div class="img-wrapper skeleton" style="border-radius: 15px; height: 180px;"></div>
            <div class="mt-3">
              <div class="skeleton-text mb-2" style="height: 14px; width: 40%;"></div>
              <div class="skeleton-text mb-3" style="height: 18px; width: 80%;"></div>
              <div class="d-flex justify-content-between align-items-center">
                <div class="skeleton-text" style="height: 16px; width: 35%;"></div>
                <div class="skeleton-text" style="height: 36px; width: 36px; border-radius: 50%;"></div>
              </div>
            </div>
          </div>
        </div>`;
    }
  }

  function resetCategoryButtons() {
    if (!categoryBar) return;
    categoryBar.querySelectorAll('.btn').forEach((b) => {
      b.style.backgroundColor = 'transparent';
      b.style.color = '#00BCD4';
      b.style.border = '2px solid #00BCD4';
    });
  }

  function renderPagination(totalCount, currentUrl) {
    if (!paginationUl) return;
    paginationUl.innerHTML = '';

    const totalPages = Math.ceil((Number(totalCount) || 0) / PAGE_SIZE);
    if (totalPages <= 1) return;

    const urlObj = new URL(currentUrl, window.location.origin);
    const currentPage = parseInt(urlObj.searchParams.get('page') || '1', 10);

    for (let i = 1; i <= totalPages; i++) {
      const li = document.createElement('li');
      li.className = `page-item ${i === currentPage ? 'active' : ''}`;
      li.innerHTML = `<a class="page-link" href="#" style="border-radius: 8px; margin: 0 3px; font-weight: bold; color: ${i === currentPage ? '#fff' : '#00BCD4'}; background-color: ${i === currentPage ? '#00BCD4' : 'transparent'}; border: 1px solid #00BCD4;">${i}</a>`;
      li.addEventListener('click', (e) => {
        e.preventDefault();
        urlObj.searchParams.set('page', String(i));
        loadProducts(urlObj.pathname + urlObj.search);
      });
      paginationUl.appendChild(li);
    }
  }

  function productCard(product) {
    const firstItem = product?.items?.length ? product.items[0] : null;
    if (!firstItem) return '';

    const productItemId = firstItem.id;
    const price = Number(firstItem.price || 0);

    let img = product.product_image || firstItem.product_image || '';
    if (typeof window.normalizeMediaUrl === 'function') img = window.normalizeMediaUrl(img);

    const fallbackImg = '/static/images/no-image.svg';
    const detailUrl = `/products/${product.id}/`;

    const safeName = esc(product?.name || '');
    const safeCategory = esc(product?.category_name || 'General');
    const safeImg = esc(img || '');
    const safeFallbackImg = esc(fallbackImg);

    const btnTitle = 'أضف للسلة';
    const btnClass = 'btn-outline-info';
    const btnIcon = "fa fa-plus";

    return `
      <div class="col-md-4 col-lg-3 mb-4">
        <div class="card product-card p-3 h-100 shadow-sm border-0" style="border-radius: 20px;">
          <a href="${detailUrl}" class="img-wrapper d-block" style="text-decoration:none; background: #f1f5f9; border-radius: 15px; height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            ${img ? `<img src="${safeImg}" alt="${safeName}" style="max-height: 80%; max-width: 80%; object-fit: contain;" data-action="img-fallback" data-fallback-src="${safeFallbackImg}">`
                : `<img src="${safeFallbackImg}" alt="" style="max-height: 80%; max-width: 80%; object-fit: contain;">`}
          </a>
          <div class="mt-3">
            <small class="text-muted text-uppercase" style="font-size: 0.7rem;">${safeCategory}</small>
            <a href="${detailUrl}" class="text-decoration-none text-dark">
              <h6 class="fw-bold mb-3 text-truncate" title="${safeName}">${safeName}</h6>
            </a>
            <div class="d-flex justify-content-between align-items-center">
              <span style="color: #00BCD4; font-weight: 800;">${price.toFixed(2)} ج.م</span>
              <button class="btn ${btnClass} btn-sm rounded-circle ms-2" title="${btnTitle}" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;" data-action="add-to-cart" data-item-id="${productItemId}" data-name="${safeName}">
                <i class='${btnIcon}'></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderProducts(products) {
    if (!grid) return;
    grid.innerHTML = '';
    if (!products || !products.length) {
      grid.innerHTML = '<div class="col-12 text-center py-5"><h5>لا توجد منتجات متاحة حالياً</h5></div>';
      return;
    }
    grid.innerHTML = products.map(productCard).join('');

    // Bind events after DOM insertion (avoid inline onclick injection).
    grid.querySelectorAll('[data-action="add-to-cart"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.getAttribute('data-item-id');
        const name = btn.getAttribute('data-name') || '';
        await window.addToCart(itemId, name);
      });
    });

    grid.querySelectorAll('img[data-action="img-fallback"]').forEach((img) => {
      img.addEventListener('error', () => {
        const fallback = img.getAttribute('data-fallback-src') || '/static/images/no-image.svg';
        img.src = fallback;
      }, { once: true });
    });
  }

  async function loadProducts(url = '/api/products/') {
    if (!grid) return;
    renderSkeletons();
    try {
      const res = await window.request(url);
      if (!res) return;
      const data = await res.json();

      const products = data.results || data;
      renderProducts(Array.isArray(products) ? products : []);
      renderPagination(data.count || (Array.isArray(products) ? products.length : 0), url);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error('Error loading products:', e);
      if (grid) grid.innerHTML = '<div class="text-center w-100 py-5 text-danger">عطل في سحب المنتجات</div>';
    }
  }

  async function loadCategories() {
    if (!categoryBar) return;
    try {
      const res = await window.request('/api/categories/');
      if (!res) return;
      const data = await res.json();
      const categories = data.results || data;
      if (!Array.isArray(categories)) return;

      categoryBar.innerHTML = '';

      const btnAll = document.createElement('button');
      btnAll.id = 'btn-all';
      btnAll.className = 'btn rounded-pill px-4 m-1 fw-bold';
      btnAll.style.backgroundColor = '#00BCD4';
      btnAll.style.color = '#fff';
      btnAll.style.border = '2px solid #00BCD4';
      btnAll.textContent = 'الكل';
      btnAll.addEventListener('click', () => {
        resetCategoryButtons();
        btnAll.style.backgroundColor = '#00BCD4';
        btnAll.style.color = '#fff';
        if (searchInput) searchInput.value = '';
        loadProducts('/api/products/');
      });
      categoryBar.appendChild(btnAll);

      categories.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'btn rounded-pill px-4 m-1 fw-bold cat-btn';
        btn.style.border = '2px solid #00BCD4';
        btn.style.color = '#00BCD4';
        btn.style.backgroundColor = 'transparent';
        btn.textContent = cat.category_name || cat.title || `قسم ${cat.id}`;
        btn.addEventListener('click', () => {
          resetCategoryButtons();
          btn.style.backgroundColor = '#00BCD4';
          btn.style.color = '#fff';
          loadProducts(`/api/products/?category=${cat.id}`);
        });
        categoryBar.appendChild(btn);
      });
    } catch (e) {
      console.error('Error loading categories:', e);
    }
  }

  // Keep original name
  window.addToCart = async function addToCart(productItemId, name) {
    const me = await (window.__veloAuth?.getMe ? window.__veloAuth.getMe() : Promise.resolve(null));
    if (!me) {
      showToast('سجّل الدخول لإضافة المنتجات إلى السلة.', 'info');
      const next = `${window.location.pathname || ''}${window.location.search || ''}`;
      window.location.replace(`/api/accounts/login-view/?next=${encodeURIComponent(next.startsWith('/') ? next : '/products/')}`);
      return;
    }
    try {
      const res = await window.request('/api/cart/cart-items/', {
        method: 'POST',
        body: JSON.stringify({ product_item: productItemId, quantity: 1 }),
      });
      if (!res) return;

      if (res.ok) {
        showToast(`تم إضافة ${String(name || '').trim() || 'المنتج'} للسلة`, 'success');

        const cartRes = await window.request(`/api/cart/?t=${Date.now()}`);
        if (!cartRes) return;
        const cartData = await cartRes.json();
        const count = (cartData.items || []).reduce((sum, item) => sum + (parseInt(item.qty || item.quantity || 0, 10) || 0), 0);
        if (window.VeloState) window.VeloState.setCartCount(count);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.detail || 'حدث خطأ أثناء الإضافة.', 'danger');
      }
    } catch (e) {
      console.error('addToCart failed', e);
      showToast('تعذر الاتصال بالخادم.', 'danger');
    }
  };

  function debounce(fn, ms) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), ms);
    };
  }

  function initAuthGate() {
    // Guest browsing is allowed.
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!grid) return;
    if (!initAuthGate()) return;

    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');

    loadCategories();
    loadProducts('/api/products/');

    if (searchInput) {
      const onType = debounce(() => {
        const q = searchInput.value.trim();
        if (q.length > 0) resetCategoryButtons();
        loadProducts(q ? `/api/products/?search=${encodeURIComponent(q)}` : '/api/products/');
      }, 350);
      searchInput.addEventListener('input', onType);
    }
  });
})();
