// static/js/cart.js

const cartList = document.getElementById('cart-list');
const cartCountBadge = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout-btn');
const checkoutModal = document.getElementById('checkoutModal');
const checkoutSummary = document.getElementById('checkout-summary');

// Render cart items
function renderCart(items) {
    cartList.innerHTML = '';
    if (!items.length) {
        cartList.innerHTML = '<li class="list-group-item text-muted">Your cart is empty.</li>';
        return;
    }
    for (const item of items) {
        const imgUrl = item.product.image?.startsWith('http') ? item.product.image : (window.MEDIA_URL || '/media/') + item.product.image;
        cartList.innerHTML += `
            <li class="list-group-item d-flex align-items-center">
                <img src="${imgUrl}" alt="${item.product.name}" class="me-2" style="width:40px;height:40px;object-fit:cover;">
                <span class="flex-grow-1">${item.product.name}</span>
                <span class="mx-2">$${item.product.price} x ${item.quantity}</span>
                <button class="btn btn-outline-danger btn-sm" onclick="removeFromCart(${item.id})">&times;</button>
            </li>
        `;
    }
}

// Fetch cart from API
window.fetchCartFromApi = async function() {
    const res = await apiFetch('/api/cart/');
    if (!res) return;
    const data = await res.json();
    renderCart(data.items || []);
    updateCartCount(data.items?.length || 0);
};

// Remove from cart
window.removeFromCart = async function(itemId) {
    const res = await apiFetch(`/api/cart/remove/${itemId}/`, { method: 'DELETE' });
    if (!res) return;
    if (res.ok) {
        showToast('Removed from cart.', 'info');
        fetchCartFromApi();
    } else {
        showToast('Error removing item.', 'danger');
    }
};

// Update cart count badge
window.updateCartCount = function(count = null) {
    if (!cartCountBadge) return;
    if (count === null) {
        // Fetch count from API
        apiFetch('/api/cart/count/').then(res => res && res.json().then(data => {
            cartCountBadge.textContent = data.count || 0;
        }));
    } else {
        cartCountBadge.textContent = count;
    }
    // Dispatch event for global sync
    document.dispatchEvent(new CustomEvent('cartCountUpdated', { detail: { count } }));
};

// Checkout modal logic
if (checkoutBtn && checkoutModal) {
    checkoutBtn.addEventListener('click', async () => {
        // Show loading skeleton
        checkoutSummary.innerHTML = '<div class="text-center py-4">Loading...</div>';
        const res = await apiFetch('/api/cart/');
        if (!res) return;
        const data = await res.json();
        // Render summary
        let total = 0;
        checkoutSummary.innerHTML = data.items.map(item => {
            total += item.product.price * item.quantity;
            return `<div>${item.product.name} x ${item.quantity} = $${item.product.price * item.quantity}</div>`;
        }).join('') + `<hr><div class="fw-bold">Total: $${total}</div>`;
    });
    // Handle checkout submit
    document.getElementById('checkout-confirm').addEventListener('click', async () => {
        const res = await apiFetch('/api/orders/', { method: 'POST' });
        if (!res) return;
        if (res.ok) {
            showToast('Order placed successfully!', 'success');
            fetchCartFromApi();
            bootstrap.Modal.getInstance(checkoutModal).hide();
        } else {
            showToast('Checkout failed.', 'danger');
        }
    });
}

// Initial cart load
if (cartList) fetchCartFromApi();
