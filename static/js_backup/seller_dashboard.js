


document.addEventListener('DOMContentLoaded', () => {
    if (window.sellerDashboardInitialized) {
        console.warn('sellerDashboardInitialized already set, skipping re-init.');
        return;
    }
    window.sellerDashboardInitialized = true;
    // Remove any cart/customer features from seller dashboard
    // Ensure no cart/customer logic is initialized for sellers
    // Remove cart loader if present
    const cartLoader = document.getElementById('loader');
    if (cartLoader) cartLoader.remove();
    // Remove any cart API polling or cart logic
    if (window.cartInterval) {
        clearInterval(window.cartInterval);
        window.cartInterval = null;
    }
    // Seller dashboard JS
    console.log('Seller Dashboard JS Loaded (first run)');
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.replace('/api/accounts/login-view/');
        return;
    }
    fetch('/api/accounts/profile/me/', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(userData => {
        if (userData.user_type !== 'seller') {
            window.location.replace('/products/');
            return;
        }
        // Only initialize seller features
        initializeDashboard(token);
    })
    .catch((err) => {
        window.location.replace('/api/accounts/login-view/');
    });
});

function initializeDashboard(token) {
    const API_BASE = '/api';
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    // Load categories
    async function loadCategories() {
        try {
            const response = await fetch(`${API_BASE}/categories/`, { headers });
            const categories = await response.json();
            const categorySelects = document.querySelectorAll('#product-category, #edit-product-category');
            categorySelects.forEach(select => {
                select.innerHTML = '<option value="">272e2a 2744412a</option>';
                categories.forEach(cat => {
                    select.innerHTML += `<option value="${cat.id}">${cat.category_name}</option>`;
                });
            });
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    // Load products
    async function loadProducts() {
        try {
            document.getElementById('loader').style.display = 'block';
            const response = await fetch(`${API_BASE}/products/`, { headers });
            const products = await response.json();
            displayProducts(products);
        } catch (error) {
            console.error('Error loading products:', error);
        } finally {
            document.getElementById('loader').style.display = 'none';
        }
    }

    // Display products
    function displayProducts(products) {
        const container = document.getElementById('products-list');
        container.innerHTML = '';

        if (products.length === 0) {
            container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">442a482c 45462c272a 28392f</p></div>';
            return;
        }

        products.forEach(product => {
            const imageUrl = product.product_image ? product.product_image : '/static/images/no-image.png';
            const card = `
                <div class="col-md-4 mb-4">
                    <div class="card h-100">
                        <img src="${imageUrl}" class="card-img-top" alt="${product.name}" style="height: 200px; object-fit: cover;">
                        <div class="card-body">
                            <h5 class="card-title">${product.name}</h5>
                            <p class="card-text">${product.description.substring(0, 100)}...</p>
                            <p class="text-muted">412a45462c272a: ${product.category_name}</p>
                        </div>
                        <div class="card-footer">
                            <button class="btn btn-sm btn-warning me-2" onclick="editProduct(${product.id})">2a2f2f4a44</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.id})">2d3241</button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });
    }

    // Add product
    document.getElementById('add-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('name', document.getElementById('product-name').value);
        formData.append('description', document.getElementById('product-description').value);
        formData.append('category', document.getElementById('product-category').value);

        const imageFile = document.getElementById('product-image').files[0];
        if (imageFile) {
            formData.append('product_image', imageFile);
        }

        try {
            const response = await fetch(`${API_BASE}/products/`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                alert('2a45 2a39482f 274445462c272a 28462c272d!');
                document.getElementById('add-product-form').reset();
                loadProducts();
            } else {
                const error = await response.json();
                alert('2e2e454a44 412a39482f 274445462c272a: ' + JSON.stringify(error));
            }
        } catch (error) {
            console.error('Error adding product:', error);
            alert('2d2f2d 2e2e454a44 412a39482f 274445462c272a');
        }
    });

    // Edit product
    window.editProduct = async function(id) {
        try {
            const response = await fetch(`${API_BASE}/products/${id}/`, { headers });
            const product = await response.json();

            document.getElementById('edit-product-id').value = product.id;
            document.getElementById('edit-product-name').value = product.name;
            document.getElementById('edit-product-description').value = product.description;
            document.getElementById('edit-product-category').value = product.category;

            const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
            modal.show();
        } catch (error) {
            console.error('Error loading product for edit:', error);
        }
    };

    // Save edit
    document.getElementById('save-edit-btn').addEventListener('click', async () => {
        const id = document.getElementById('edit-product-id').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('edit-product-name').value);
        formData.append('description', document.getElementById('edit-product-description').value);
        formData.append('category', document.getElementById('edit-product-category').value);

        const imageFile = document.getElementById('edit-product-image').files[0];
        if (imageFile) {
            formData.append('product_image', imageFile);
        }

        try {
            const response = await fetch(`${API_BASE}/products/${id}/`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                alert('2a45 2a2d4a2b 274445462c272a 28462c272d!');
                bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
                loadProducts();
            } else {
                const error = await response.json();
                alert('2e2e454a44 412a2d4a2b 274445462c272a: ' + JSON.stringify(error));
            }
        } catch (error) {
            console.error('Error updating product:', error);
            alert('2d2f2d 2e2e454a44 412a2d4a2b 274445462c272a');
        }
