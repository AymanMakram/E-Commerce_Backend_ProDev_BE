// تعريف الوظائف لضمان وصولها للأزرار (Global Scope)
window.updateQtyApi = null;
window.removeItemApi = null;

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('cart-items-container');
    const totalElement = document.getElementById('cart-total');
    const subtotalElement = document.getElementById('cart-subtotal');

    // 1. وظيفة عرض السلة الفارغة
    function renderEmptyCart(message = "السلة فارغة") {
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fa-solid fa-cart-arrow-down fa-3x mb-3 text-muted"></i>
                    <h5 class="fw-bold">${message}</h5>
                    <a href="/" class="btn btn-info text-white mt-3 px-4 rounded-pill" style="background-color: #00BCD4; border: none;">تسوق الآن</a>
                </div>`;
        }
        updateTotals(0);
    }

    // 2. تحديث الإجماليات في الواجهة
    function updateTotals(total) {
        const formattedTotal = parseFloat(total || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
        if (totalElement) totalElement.textContent = formattedTotal + ' ج.م';
        if (subtotalElement) subtotalElement.textContent = formattedTotal + ' ج.م';
    }

    // 3. رسم عناصر السلة
    function renderCartItems(items, totalAmount) {
        let html = '';
        items.forEach((item) => {
            const imgSource = item.product_image || '/static/images/default.jpg';
            const itemName = item.product_name || 'منتج';
            const itemPrice = parseFloat(item.product_price || 0);
            const qty = item.quantity || 1;
            const subtotal = parseFloat(item.subtotal || (qty * itemPrice));

            html += `
                <div class="d-flex align-items-center mb-4 pb-3 border-bottom flex-wrap flex-md-nowrap">
                    <img src="${imgSource}" style="width: 100px; height: 100px; object-fit: contain; border-radius: 15px;" class="bg-light p-2" onerror="this.src='/static/images/default.jpg'">
                    <div class="ms-md-3 flex-grow-1 mt-3 mt-md-0 text-start">
                        <h6 class="fw-bold mb-1">${itemName}</h6>
                        <p class="text-info mb-0 fw-bold" style="color: #00BCD4 !important;">${itemPrice.toLocaleString()} ج.م</p>
                    </div>
                    <div class="d-flex align-items-center mx-md-4 my-3 my-md-0">
                        <button class="btn btn-sm btn-outline-secondary rounded-circle" onclick="updateQtyApi(${item.id}, ${qty - 1})" style="width:30px; height:30px;">-</button>
                        <span class="mx-3 fw-bold fs-5">${qty}</span>
                        <button class="btn btn-sm btn-outline-secondary rounded-circle" onclick="updateQtyApi(${item.id}, ${qty + 1})" style="width:30px; height:30px;">+</button>
                    </div>
                    <div class="text-end" style="min-width: 120px;">
                        <span class="fw-bold fs-6">${subtotal.toLocaleString()} ج.م</span>
                        <br>
                        <button class="btn btn-link text-danger p-0 mt-2 text-decoration-none" onclick="removeItemApi(${item.id})">
                            <i class="fa-solid fa-trash-can me-1"></i> حذف
                        </button>
                    </div>
                </div>`;
        });
        if (container) container.innerHTML = html;
        updateTotals(totalAmount);
    }

    // 4. جلب السلة من السيرفر
    async function fetchCartFromApi() {
        try {
            // استخدام المسار الموحد الموصل بـ CART_CONFIG
            const response = await fetch(window.CART_CONFIG.apiUrl, { 
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRFToken': window.CART_CONFIG.csrfToken
                },
                credentials: 'include' 
            });

            if (response.status === 403) {
                renderEmptyCart("يرجى تسجيل الدخول لعرض السلة");
                return;
            }

            const data = await response.json();
            
            let items = [];
            let total = 0;

            // معالجة شكل الـ JSON من السيرفر (DRF)
            if (data.items) {
                items = data.items;
                total = data.total_price;
            } else if (data.results && data.results[0]) {
                items = data.results[0].items || [];
                total = data.results[0].total_price || 0;
            } else if (Array.isArray(data)) {
                items = data;
                total = items.reduce((sum, i) => sum + (parseFloat(i.subtotal) || 0), 0);
            }

            if (items.length === 0) {
                renderEmptyCart("السلة فارغة حالياً.. ابدأ التسوق الآن!");
            } else {
                renderCartItems(items, total);
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            renderEmptyCart("حدث خطأ أثناء تحميل السلة");
        }
    }

    // 5. تحديث الكمية
    window.updateQtyApi = async function(itemId, newQty) {
        if (newQty < 1) return;
        try {
            const response = await fetch(`${window.CART_CONFIG.itemsApiUrl}${itemId}/`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json', 
                    'X-CSRFToken': window.CART_CONFIG.csrfToken 
                },
                credentials: 'include',
                body: JSON.stringify({ quantity: newQty })
            });
            if (response.ok) fetchCartFromApi(); 
        } catch (e) { console.error("Update failed", e); }
    };

    // 6. حذف عنصر
    window.removeItemApi = async function(itemId) {
        if (confirm('هل تريد حذف هذا المنتج؟')) {
            try {
                const response = await fetch(`${window.CART_CONFIG.itemsApiUrl}${itemId}/`, {
                    method: 'DELETE',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRFToken': window.CART_CONFIG.csrfToken 
                    },
                    credentials: 'include'
                });
                if (response.ok) fetchCartFromApi();
            } catch (e) { console.error("Delete failed", e); }
        }
    };

    fetchCartFromApi();
});