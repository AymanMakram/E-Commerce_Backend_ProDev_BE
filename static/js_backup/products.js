document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.replace('/api/accounts/login-view/');
        return;
    }

    // Check user type - redirect sellers to their dashboard
    fetch('/api/accounts/profile/me/', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(userData => {
        window.userType = userData.user_type;
        if (userData.user_type === 'seller') {
            window.location.replace('/seller/');
            return;
        }
        // Proceed with products page initialization
        initializeProductsPage();
    })
    .catch(error => {
        console.error('Error fetching user profile:', error);
        window.location.replace('/api/accounts/login-view/');
    });

    function initializeProductsPage() {
        // --- 
2746 2a3946273531 ---
    const grid = document.getElementById('products-grid');
    const categoryBar = document.getElementById('category-bar');
    const searchInput = document.getElementById('product-search'); 
    
    const PAGE_SIZE = 20; 

    // --- 452a3a4a31272a 2a2d454a44 ---
    let debounceTimer;

    // --- 27462a2d454a44 ---

    // 1. 482a4a412a 2c4428 274445462c272a
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
            grid.innerHTML = '<div class="text-center w-100 py-5 text-danger">39482d 412d454a44 274445462c272a</div>';
        } finally {
            grid.style.opacity = "1";
            const loader = document.getElementById('main-loader');
            if (loader) loader.remove();
        }
    }

    // 2. 482a4a412a 2c4428 2744233345462c272a
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
            btnAllDynamic.textContent = '274443';
            
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
                btn.textContent = cat.category_name || cat.title || `423345 ${cat.id}`;
                
                btn.onclick = () => {
                    resetCategoryButtons();
                    btn.style.backgroundColor = '#00BCD4';
                    btn.style.color = '#fff';
                    loadProducts(`/api/products/?category=${cat.id}`);
                };
                categoryBar.appendChild(btn);
            });
        } catch (e) {
            console.error("2e2e454a44 412d2d454a44 2744233345462c272a:", e);
        }
    }

    function resetCategoryButtons() {
        document.querySelectorAll('#category-bar .btn').forEach(b => {
            b.style.backgroundColor = 'transparent';
            b.style.color = '#00BCD4';
        });
    }

    // 3. 482a4a412a 27443145 (2a45 27442a3946 47462a2d454a44 4439454831 2744354831)
    function renderProducts(products) {
        if (!grid) return;
        grid.innerHTML = ''; 
        if (!products || products.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center py-5"><h5>442a482c 45462c272a 452a2d4a27462a</h5></div>';
            return;
        }

        const html = products.map(p => {
            const firstItem = p.items && p.items.length > 0 ? p.items[0] : null;
            if (!firstItem) return ''; 

            const productItemId = firstItem.id; 
            const price = firstItem.price || "0.00";
            
            // 452a3946 2f434a2746 453345462c272a
            let imgSource = p.product_image || firstItem.product_image;
            if (imgSource && !imgSource.startsWith('http') && !imgSource.startsWith('/')) {
                imgSource = '/' + imgSource; // 2f45462c272a 482c482f 2744334429 2744452d444a29
            }

            // 2a393145 352f2f2c272a 412d2d454a44
            const fallbackImg = '/static/images/default.jpg';

            let mediaContent = imgSource 
                ? `<img src="${imgSource}" 
                        style="max-height: 80%; max-width: 80%; object-fit: contain;" 
                        onerror="this.onerror=null;this.src='${fallbackImg}';">`
                : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, #00BCD4 0%, #00acc1 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">Product</div>`;

            let cartBtn = '';
            if (window.userType === 'customer') {
                cartBtn = `<button class="btn btn-outline-info btn-sm rounded-circle ms-2" title="2336 4444334429" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;" onclick="addToCart('${productItemId}', '${p.name.replace(/'/g, "\\'")}', '${price}', '${imgSource}')">
                    <i class='fa fa-plus'></i>
                </button>`;
            }
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
                                <span style="color: #00BCD4; font-weight: 800;">${price} 2c.45</span>
                                ${cartBtn}
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');
        grid.innerHTML = html;
    }

    // 4. 482a4a412a 27442a3946
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
