// static/js/cart.js

const cartItemsContainer = document.getElementById('cart-items-container');
const cartEmpty = document.getElementById('cart-empty');
const cartSubtotal = document.getElementById('cart-subtotal');
const cartTotal = document.getElementById('cart-total');
const cartCountBadge = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout-btn');
const checkoutModal = document.getElementById('checkoutModal');
const checkoutSummary = document.getElementById('checkout-summary');
const checkoutConfirmBtn = document.getElementById('checkout-confirm');

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

function updateCartBadgeFromItems(items) {
    if (!cartCountBadge) return;
    const totalQty = (items || []).reduce((sum, item) => {
        const q = parseInt(item.qty || item.quantity || 0);
        return sum + (Number.isNaN(q) ? 0 : q);
    }, 0);
    cartCountBadge.textContent = totalQty;
    document.dispatchEvent(new CustomEvent('cartCountUpdated', { detail: { count: totalQty } }));
}

function normalizeImageUrl(path) {
    if (!path) return '';
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

    cartItemsContainer.innerHTML = items.map(item => {
        const name = item.product_name || (item.product_item && item.product_item.product_name) || 'منتج';
        const price = item.price || (item.product_item && item.product_item.price) || 0;
        const qty = item.qty || item.quantity || 1;
        const imagePath = normalizeImageUrl(item.product_image || (item.product_item && item.product_item.product_image) || '');

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

async function fetchCartFromApi() {
    if (!cartItemsContainer) return;
    showCartSkeletons();
    try {
        const res = await (window.apiFetch ? window.apiFetch(`/api/cart/?t=${Date.now()}`) : fetch(`/api/cart/?t=${Date.now()}`));
        if (!res) return;
        const data = await res.json();
        renderCartItems(data.items || []);
        updateTotals(data.total_price || 0);
        updateCartBadgeFromItems(data.items || []);
    } catch (e) {
        console.error('Cart fetch failed', e);
        if (typeof showToast === 'function') showToast('تعذر تحميل السلة.', 'danger');
    }
}

window.updateQuantity = async function(itemId, newQty) {
    if (!itemId || newQty < 1) return;
    try {
        const res = await (window.apiFetch ? window.apiFetch(`/api/cart/cart-items/${itemId}/`, {
            method: 'PATCH',
            body: JSON.stringify({ qty: newQty })
        }) : fetch(`/api/cart/cart-items/${itemId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': (window.CART_CONFIG && window.CART_CONFIG.csrfToken) ? window.CART_CONFIG.csrfToken : ''
            },
            body: JSON.stringify({ qty: newQty }),
            credentials: 'include'
        }));
        if (!res) return;
        if (res.ok) {
            fetchCartFromApi();
        } else {
            if (typeof showToast === 'function') showToast('فشل تحديث الكمية.', 'danger');
        }
    } catch (e) {
        console.error('Quantity update failed', e);
        if (typeof showToast === 'function') showToast('تعذر الاتصال بالخادم.', 'danger');
    }
};

window.deleteCartItem = async function(itemId) {
    if (!itemId) return;
    if (!confirm('هل تريد حذف هذا المنتج من السلة؟')) return;
    try {
        const res = await (window.apiFetch ? window.apiFetch(`/api/cart/cart-items/${itemId}/`, {
            method: 'DELETE'
        }) : fetch(`/api/cart/cart-items/${itemId}/`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': (window.CART_CONFIG && window.CART_CONFIG.csrfToken) ? window.CART_CONFIG.csrfToken : ''
            },
            credentials: 'include'
        }));
        if (!res) return;
        if (res.ok) {
            if (typeof showToast === 'function') showToast('تم حذف المنتج من السلة.', 'info');
            fetchCartFromApi();
        } else {
            if (typeof showToast === 'function') showToast('فشل حذف المنتج.', 'danger');
        }
    } catch (e) {
        console.error('Delete failed', e);
        if (typeof showToast === 'function') showToast('تعذر الاتصال بالخادم.', 'danger');
    }
};

if (checkoutBtn && checkoutModal && checkoutSummary) {
    checkoutBtn.addEventListener('click', async () => {
        checkoutSummary.innerHTML = '<div class="text-center py-4">Loading...</div>';
        const res = await (window.apiFetch ? window.apiFetch(`/api/cart/?t=${Date.now()}`) : fetch(`/api/cart/?t=${Date.now()}`));
        if (!res) return;
        const data = await res.json();
        const items = data.items || [];
        if (!items.length) {
            checkoutSummary.innerHTML = '<div class="text-muted">السلة فارغة.</div>';
            return;
        }
        const lines = items.map(i => {
            const name = i.product_name || (i.product_item && i.product_item.product_name) || 'منتج';
            const qty = i.qty || i.quantity || 1;
            const price = i.price || (i.product_item && i.product_item.price) || 0;
            return `<div class="d-flex justify-content-between"><span>${name} × ${qty}</span><span>${formatCurrencyEGP(price * qty)}</span></div>`;
        }).join('');
        checkoutSummary.innerHTML = `${lines}<hr><div class="d-flex justify-content-between fw-bold"><span>الإجمالي</span><span>${formatCurrencyEGP(data.total_price || 0)}</span></div>`;
    });
}

if (checkoutConfirmBtn) {
    checkoutConfirmBtn.addEventListener('click', async () => {
        try {
            const res = await (window.apiFetch ? window.apiFetch('/api/orders/', { method: 'POST', body: JSON.stringify({}) }) : fetch('/api/orders/', { method: 'POST' }));
            if (!res) return;
            if (res.ok) {
                if (typeof showToast === 'function') showToast('تم إنشاء الطلب بنجاح!', 'success');
                fetchCartFromApi();
                if (checkoutModal && window.bootstrap) {
                    window.bootstrap.Modal.getInstance(checkoutModal)?.hide();
                }
            } else {
                if (typeof showToast === 'function') showToast('فشل إتمام الطلب.', 'danger');
            }
        } catch (e) {
            console.error('Checkout failed', e);
            if (typeof showToast === 'function') showToast('تعذر الاتصال بالخادم.', 'danger');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCartFromApi();
});