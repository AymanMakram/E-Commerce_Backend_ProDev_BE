document.addEventListener('DOMContentLoaded', function() {
    // --- الجزء 1: تعريف العناصر ---
    const grid = document.getElementById('products-grid');
    const categoryBar = document.getElementById('category-bar');
    const searchInput = document.getElementById('product-search'); 
    
    const PAGE_SIZE = 20; 

    // --- متغيرات الحالة ---
    let debounceTimer;

    // --- الجزء 2: الوظائف ---

    // 1. وظيفة جلب المنتجات
    async function loadProducts(url = '/api/products/') {
        if (!grid) return;
        grid.style.opacity = "0.5"; 
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            renderProducts(data.results || []);
            renderPagination(data.count, url);
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            console.error("Error loading products:", e);
            grid.innerHTML = '<div class="text-center w-100 py-5 text-danger">عطل في سحب المنتجات</div>';
        } finally {
            grid.style.opacity = "1";
            const loader = document.getElementById('main-loader');
            if (loader) loader.remove();
        }
    }

    // 2. وظيفة جلب الأقسام
    async function loadCategories() {
        if (!categoryBar) return;
        try {
            const res = await fetch('/api/categories/');
            const data = await res.json();
            const categories = data.results || data;

            if (!Array.isArray(categories)) return;

            categoryBar.innerHTML = ''; 
            
            const btnAllDynamic = document.createElement('button');
            btnAllDynamic.id = 'btn-all';
            btnAllDynamic.className = 'btn rounded-pill px-4 m-1 fw-bold';
            btnAllDynamic.style.backgroundColor = '#00BCD4';
            btnAllDynamic.style.color = '#fff';
            btnAllDynamic.style.border = '2px solid #00BCD4';
            btnAllDynamic.textContent = 'الكل';
            
            btnAllDynamic.onclick = () => {
                resetCategoryButtons();
                btnAllDynamic.style.backgroundColor = '#00BCD4';
                btnAllDynamic.style.color = '#fff';
                if (searchInput) searchInput.value = '';
                loadProducts('/api/products/');
            };
            categoryBar.appendChild(btnAllDynamic);

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'btn rounded-pill px-4 m-1 fw-bold cat-btn';
                btn.style.border = '2px solid #00BCD4';
                btn.style.color = '#00BCD4';
                btn.style.backgroundColor = 'transparent';
                btn.textContent = cat.category_name || cat.title || `قسم ${cat.id}`;
                
                btn.onclick = () => {
                    resetCategoryButtons();
                    btn.style.backgroundColor = '#00BCD4';
                    btn.style.color = '#fff';
                    loadProducts(`/api/products/?category=${cat.id}`);
                };
                categoryBar.appendChild(btn);
            });
        } catch (e) {
            console.error("خطأ في تحميل الأقسام:", e);
        }
    }

    function resetCategoryButtons() {
        document.querySelectorAll('#category-bar .btn').forEach(b => {
            b.style.backgroundColor = 'transparent';
            b.style.color = '#00BCD4';
        });
    }

    // 3. وظيفة الرسم (تم التعديل هنا لضمان ظهور الصور)
    function renderProducts(products) {
        if (!grid) return;
        grid.innerHTML = ''; 
        if (!products || products.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center py-5"><h5>لا توجد منتجات متاحة حالياً</h5></div>';
            return;
        }

        const html = products.map(p => {
            const firstItem = p.items && p.items.length > 0 ? p.items[0] : null;
            if (!firstItem) return ''; 

            const productItemId = firstItem.id; 
            const price = firstItem.price || "0.00";
            
            // معالجة ذكية لمسار الصورة
            let imgSource = p.product_image || firstItem.product_image;
            if (imgSource && !imgSource.startsWith('http') && !imgSource.startsWith('/')) {
                imgSource = '/' + imgSource; // ضمان وجود السلاش الأول للمسارات المحلية
            }

            // تعريف صورة بديلة في حال الفشل
            const fallbackImg = '/static/images/default.jpg';

            let mediaContent = imgSource 
                ? `<img src="${imgSource}" 
                        style="max-height: 80%; max-width: 80%; object-fit: contain;" 
                        onerror="this.onerror=null;this.src='${fallbackImg}';">`
                : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, #00BCD4 0%, #00acc1 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">Product</div>`;

            return `
                <div class="col-md-4 col-lg-3 mb-4">
                    <div class="card product-card p-3 h-100 shadow-sm border-0" style="border-radius: 20px;">
                        <div class="img-wrapper" style="background: #f1f5f9; border-radius: 15px; height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                            ${mediaContent}
                        </div>
                        <div class="mt-3">
                            <small class="text-muted text-uppercase" style="font-size: 0.7rem;">${p.category_name || 'General'}</small>
                            <h6 class="fw-bold mb-3 text-truncate" title="${p.name}">${p.name}</h6>
                            <div class="d-flex justify-content-between align-items-center">
                                <span style="color: #00BCD4; font-weight: 800;">${price} ج.م</span>
                                <button class="btn btn-sm btn-dark" 
                                    onclick="addToCart('${productItemId}', '${p.name.replace(/'/g, "\\'")}', '${price}', '${imgSource}')"
                                    style="border-radius: 10px; width: 35px; height: 35px;">+</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');
        grid.innerHTML = html;
    }

    // 4. وظيفة الترقيم
    function renderPagination(totalCount, currentUrl) {
        const paginationUl = document.getElementById('pagination-controls');
        if (!paginationUl) return;

        paginationUl.innerHTML = '';
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (totalPages <= 1) return;

        const urlObj = new URL(currentUrl, window.location.origin);
        let currentPage = parseInt(urlObj.searchParams.get('page')) || 1;

        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" style="border-radius: 8px; margin: 0 3px; font-weight: bold; color: ${i === currentPage ? '#fff' : '#00BCD4'}; background-color: ${i === currentPage ? '#00BCD4' : 'transparent'}; border: 1px solid #00BCD4;">${i}</a>`;
            li.onclick = (e) => {
                e.preventDefault();
                urlObj.searchParams.set('page', i);
                loadProducts(urlObj.pathname + urlObj.search);
            };
            paginationUl.appendChild(li);
        }
    }

    /**
     * 5. تحديث عداد السلة (تستخدم الـ Reduce لجمع الكميات)
     */
    function updateCartBadge() {
        fetch('/api/cart/?t=' + new Date().getTime(), { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                const badge = document.getElementById('cart-count');
                if (badge && data.items) {
                    const totalQty = data.items.reduce((sum, item) => sum + (parseInt(item.qty || item.quantity) || 0), 0);
                    badge.textContent = totalQty;

                    badge.style.transition = 'transform 0.2s ease-in-out';
                    badge.style.transform = 'scale(1.3)';
                    setTimeout(() => badge.style.transform = 'scale(1)', 200);
                }
            }).catch(e => console.error("Badge update failed", e));
    }

    /**
     * 6. دالة الإضافة للسلة (متاحة عالمياً)
     */
    window.addToCart = async function(productItemId, name, price, image) {
        const token = window.CART_CONFIG ? window.CART_CONFIG.csrfToken : '';

        try {
            const response = await fetch('/api/cart/cart-items/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': token
                },
                body: JSON.stringify({ 
                    product_item: productItemId, 
                    quantity: 1 
                }),
                credentials: 'include'
            });

            if (response.ok) {
                updateCartBadge(); 
                console.log(`تم إضافة ${name} للسلة`);
                alert(`تم إضافة ${name} للسلة بنجاح`);
            } else if (response.status === 403) {
                alert("يرجى تسجيل الدخول أولاً.");
            } else {
                alert("حدث خطأ أثناء الإضافة.");
            }
        } catch (e) {
            console.error("Network Error:", e);
        }
    }

    // --- الجزء 3: التشغيل الفعلي (Events) ---
    if (searchInput) {
        searchInput.oninput = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = searchInput.value.trim();
                if (query.length > 0) resetCategoryButtons();
                loadProducts(query === '' ? '/api/products/' : `/api/products/?search=${query}`);
            }, 500);
        };
    }

    loadCategories();
    loadProducts();
    updateCartBadge(); 
});