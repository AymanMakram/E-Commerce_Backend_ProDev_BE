// Modern Checkout Page Frontend
// Fetches data from APIs and renders with best practices (async/await, modular, clean UI)

class CheckoutPage {
    constructor() {
        this.token = localStorage.getItem('access_token');
        this.addressSection = document.getElementById('address-section');
        this.paymentSection = document.getElementById('payment-section');
        this.paymentFormSection = document.getElementById('payment-form-section');
        this.loader = document.getElementById('checkout-loader');
        this.form = document.getElementById('checkout-form');
        this.selectedPaymentId = null;
        this.selectedAddressId = null;
        this.addressExists = false;
        this.paymentExists = false;
        this.init();
    }

    async init() {
        await this.loadProfileData();
        this.loader.style.display = 'none';
        this.form.style.display = '';
        this.form.onsubmit = (e) => this.submitOrder(e);
    }

    async loadProfileData() {
        try {
            const res = await fetch('/api/accounts/profile/me/', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const profile = await res.json();
            this.renderAddress(profile.addresses || []);
            this.renderPayments(profile.payment_methods || []);
        } catch (e) {
            this.addressSection.innerHTML = '<div class="alert alert-danger">فشل تحميل البيانات.</div>';
            this.paymentSection.innerHTML = '';
        }
    }

    renderAddress(addresses) {
        if (addresses.length > 0) {
            this.addressExists = true;
            this.selectedAddressId = addresses[0].id;
            this.addressSection.innerHTML = `
                <div class="mb-3 p-3 bg-light rounded-3 shadow-sm">
                    <strong>العنوان:</strong>
                    <span class="ms-2">${addresses[0].city}, ${addresses[0].street}, ${addresses[0].country}</span>
                </div>
            `;
        } else {
            this.addressExists = false;
            this.addressSection.innerHTML = `
                <div class="alert alert-warning d-flex justify-content-between align-items-center">
                    <span>لا يوجد عنوان محفوظ.</span>
                    <button id='show-add-address' class='btn btn-sm btn-outline-info ms-2'>إضافة عنوان جديد</button>
                </div>
            `;
            document.getElementById('show-add-address').onclick = () => this.showAddAddressForm();
        }
    }

    showAddAddressForm() {
        this.addressSection.innerHTML = `
            <form id="add-address-form-page" class="p-3 bg-white rounded-3 shadow-sm">
                <div class="mb-2"><input type="text" class="form-control" id="page-address-city" placeholder="المدينة" required></div>
                <div class="mb-2"><input type="text" class="form-control" id="page-address-street" placeholder="الشارع" required></div>
                <div class="mb-2"><input type="text" class="form-control" id="page-address-country" placeholder="الدولة" required></div>
                <button type="submit" class="btn btn-info w-100">حفظ العنوان</button>
            </form>
        `;
        document.getElementById('add-address-form-page').onsubmit = (e) => this.addAddress(e);
    }

    async addAddress(e) {
        e.preventDefault();
        const city = document.getElementById('page-address-city').value.trim();
        const street = document.getElementById('page-address-street').value.trim();
        const country = document.getElementById('page-address-country').value.trim();
        if (!city || !street || !country) { alert('يرجى تعبئة جميع الحقول'); return; }
        try {
            const res = await fetch('/api/accounts/profile/add-address/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ city, street, country })
            });
            if (res.ok) {
                await this.loadProfileData();
            } else {
                alert('فشل حفظ العنوان');
            }
        } catch (e) { alert('خطأ في الاتصال بالخادم'); }
    }

    renderPayments(payments) {
        let html = '';
        if (payments.length > 0) {
            this.paymentExists = true;
            this.selectedPaymentId = payments[payments.length-1].id;
            html += '<div class="mb-2"><strong>اختر طريقة الدفع:</strong></div>';
            payments.forEach(pm => {
                html += `<div class="form-check mb-2">
                    <input class="form-check-input" type="radio" name="payment-method" value="${pm.id}" ${pm.id === this.selectedPaymentId ? 'checked' : ''}>
                    <label class="form-check-label">${pm.payment_type_name} - ${pm.provider || ''}</label>
                    <span class="badge bg-${pm.payment_status === 'Success' ? 'success' : 'warning'} ms-2">${pm.payment_status || ''}</span>
                </div>`;
            });
            html += `<button id='show-add-payment' class='btn btn-sm btn-outline-info mt-2'>إضافة طريقة دفع جديدة</button>`;
        } else {
            this.paymentExists = false;
            html = `<div class="alert alert-warning">لا يوجد طريقة دفع محفوظة.</div><button id='show-add-payment' class='btn btn-sm btn-outline-info mt-2'>إضافة طريقة دفع جديدة</button>`;
        }
        this.paymentSection.innerHTML = html;
        document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.selectedPaymentId = parseInt(e.target.value);
            });
        });
        const showAddPaymentBtn = document.getElementById('show-add-payment');
        if (showAddPaymentBtn) {
            showAddPaymentBtn.onclick = () => this.showAddPaymentForm();
        }
    }

    async showAddPaymentForm() {
        this.paymentSection.style.display = 'none';
        this.paymentFormSection.style.display = '';
        // Fetch payment types from API
        let paymentTypeOptions = '<option value="">اختر نوع الدفع</option>';
        let paymentTypes = [];
        try {
            const res = await fetch('/api/accounts/payment-types/', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.ok) {
                paymentTypes = await res.json();
                paymentTypes.forEach(pt => {
                    paymentTypeOptions += `<option value="${pt.id}">${pt.value}</option>`;
                });
            } else {
                paymentTypeOptions += '<option disabled>تعذر تحميل الأنواع</option>';
            }
        } catch (e) {
            paymentTypeOptions += '<option disabled>تعذر تحميل الأنواع</option>';
        }
        this.paymentFormSection.innerHTML = `
            <form id="add-payment-form-page" class="p-3 bg-white rounded-3 shadow-sm">
                <div class="mb-2">
                    <label class="form-label">نوع الدفع</label>
                    <select class="form-select" id="page-payment-type" required>
                        ${paymentTypeOptions}
                    </select>
                </div>
                <div id="dynamic-payment-fields"></div>
                <button type="submit" class="btn btn-info w-100">حفظ طريقة الدفع</button>
            </form>
        `;
        // Dynamic fields logic
        const typeSelect = document.getElementById('page-payment-type');
        const dynamicFields = document.getElementById('dynamic-payment-fields');
        function renderFields(typeId) {
            const typeObj = paymentTypes.find(pt => pt.id == typeId);
            if (!typeObj) { dynamicFields.innerHTML = ''; return; }
            switch (typeObj.value) {
                case 'Credit Card':
                case 'Debit Card':
                    dynamicFields.innerHTML = `
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="اسم البنك" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-account" placeholder="رقم البطاقة" required></div>
                        <div class="mb-2"><input type="date" class="form-control" id="page-payment-expiry" placeholder="تاريخ الانتهاء" required></div>
                    `;
                    break;
                case 'PayPal':
                case 'Apple Pay':
                case 'Google Pay':
                case 'Amazon Pay':
                    dynamicFields.innerHTML = `
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="البريد الإلكتروني أو اسم الحساب" required></div>
                    `;
                    break;
                case 'Gift Card':
                    dynamicFields.innerHTML = `
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-account" placeholder="رمز البطاقة" required></div>
                    `;
                    break;
                case 'Cash on Delivery':
                    dynamicFields.innerHTML = `<div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="اسم المستلم" required></div>`;
                    break;
                case 'Bank Transfer':
                    dynamicFields.innerHTML = `
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="اسم البنك" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-account" placeholder="رقم الحساب البنكي" required></div>
                    `;
                    break;
                case 'EMI':
                    dynamicFields.innerHTML = `
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="اسم البنك أو الشركة" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-account" placeholder="رقم الحساب / البطاقة" required></div>
                    `;
                    break;
                default:
                    dynamicFields.innerHTML = `<div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="مزود الخدمة" required></div>`;
            }
        }
        typeSelect.addEventListener('change', function() {
            renderFields(this.value);
        });
        // Initial render if preselected
        renderFields(typeSelect.value);
        const addPaymentForm = document.getElementById('add-payment-form-page');
        if (addPaymentForm) {
            addPaymentForm.onsubmit = (e) => this.addPaymentMethod(e);
        }
    }

    async addPaymentMethod(e) {
        e.preventDefault();
        const payment_type = document.getElementById('page-payment-type').value;
        const provider = document.getElementById('page-payment-provider') ? document.getElementById('page-payment-provider').value.trim() : '';
        const account_number = document.getElementById('page-payment-account') ? document.getElementById('page-payment-account').value.trim() : '';
        const expiry_date = document.getElementById('page-payment-expiry') ? document.getElementById('page-payment-expiry').value : '';
        const submitBtn = document.querySelector('#add-payment-form-page button[type="submit"]');
        if (!payment_type) { this.showError(submitBtn, 'يرجى اختيار نوع الدفع'); return; }
        let missing = false;
        document.querySelectorAll('#dynamic-payment-fields input[required]').forEach(input => {
            if (!input.value.trim()) missing = true;
        });
        if (missing) { this.showError(submitBtn, 'يرجى تعبئة جميع الحقول'); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = '...جاري حفظ طريقة الدفع';
        try {
            const res = await fetch('/api/accounts/profile/payment-methods/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ payment_type, provider, account_number, expiry_date })
            });
            if (res.ok) {
                this.paymentFormSection.style.display = 'none';
                this.paymentSection.style.display = '';
                await this.loadProfileData();
            } else {
                const err = await res.json().catch(() => ({}));
                this.showError(submitBtn, err.detail || 'فشل حفظ طريقة الدفع');
            }
        } catch (e) {
            this.showError(submitBtn, 'خطأ في الاتصال بالخادم');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'حفظ طريقة الدفع';
        }
    }

    async submitOrder(e) {
        e.preventDefault();
        if (!this.addressExists) {
            this.showError(this.form.querySelector('button[type="submit"]'), 'يرجى إضافة عنوان أولاً');
            return;
        }
        if (!this.paymentExists || !this.selectedPaymentId) {
            this.showError(this.form.querySelector('button[type="submit"]'), 'يرجى اختيار أو إضافة طريقة دفع أولاً');
            return;
        }
        const submitBtn = this.form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '...جاري إتمام الطلب';
        try {
            const response = await fetch('/api/orders/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': window.CART_CONFIG.csrfToken,
                    'Authorization': this.token ? `Bearer ${this.token}` : ''
                },
                credentials: 'include',
                body: JSON.stringify({ payment_method: this.selectedPaymentId })
            });
            if (response.ok) {
                const data = await response.json();
                if (data && data.id) {
                    window.location.href = `/orders/track/${data.id}/`;
                } else {
                    window.location.href = '/orders/';
                }
            } else {
                const err = await response.json().catch(() => ({}));
                this.showError(submitBtn, err.detail || 'حدث خطأ أثناء إتمام الطلب.');
            }
        } catch (e) {
            this.showError(submitBtn, 'حدث خطأ في الاتصال بالخادم.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'تأكيد الطلب و الدفع';
        }
    }
    showError(btn, msg) {
        if (!btn) return;
        let errDiv = btn.parentElement.querySelector('.checkout-error');
        if (!errDiv) {
            errDiv = document.createElement('div');
            errDiv.className = 'checkout-error alert alert-danger mt-2';
            btn.parentElement.appendChild(errDiv);
        }
        errDiv.textContent = msg;
        setTimeout(() => { errDiv.remove(); }, 4000);
    }
}

// Initialize modern checkout page
if (document.getElementById('checkout-form')) {
    new CheckoutPage();
}
