document.addEventListener('DOMContentLoaded', async function() {
    const loader = document.getElementById('checkout-loader');
    const form = document.getElementById('checkout-form');
    let selectedPaymentId = null;
    let selectedAddressId = null;
    let addressExists = false;
    let paymentExists = false;
    function logCheckoutDebug(msg, ...args) { try { console.log('[CHECKOUT]', msg, ...args); } catch(e) {} }
    const token = localStorage.getItem('access_token');

    async function loadCheckoutContent() {
        logCheckoutDebug('Loading checkout page content...');
        let addresses = [];
        let payments = [];
        try {
            const profileRes = await fetch('/api/accounts/profile/me/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const profile = await profileRes.json();
            addresses = profile.addresses || [];
            payments = profile.payment_methods || [];
        } catch (e) { logCheckoutDebug('Error fetching profile:', e); }
        // Address section
        let addressHtml = '';
        if (addresses.length > 0) {
            addressExists = true;
            selectedAddressId = addresses[0].id;
            addressHtml = `<div class="mb-3"><strong>العنوان:</strong> ${addresses[0].city}, ${addresses[0].street}, ${addresses[0].country}</div>`;
        } else {
            addressExists = false;
            addressHtml = `<div class="alert alert-warning">لا يوجد عنوان محفوظ. <button id='show-add-address' class='btn btn-sm btn-outline-info ms-2'>إضافة عنوان جديد</button></div>`;
        }
        logCheckoutDebug('Addresses:', addresses, 'Selected:', selectedAddressId);
        document.getElementById('address-section').innerHTML = addressHtml;
        // Payment section
        let paymentHtml = '';
        if (payments.length > 0) {
            paymentExists = true;
            selectedPaymentId = payments[payments.length-1].id;
            paymentHtml = '<div class="mb-2"><strong>اختر طريقة الدفع:</strong></div>';
            payments.forEach(pm => {
                paymentHtml += `<div class="form-check mb-2"><input class="form-check-input" type="radio" name="payment-method" value="${pm.id}" ${pm.id === selectedPaymentId ? 'checked' : ''}> <label class="form-check-label">${pm.payment_type_name} - ${pm.provider || ''}</label></div>`;
            });
            paymentHtml += `<button id='show-add-payment' class='btn btn-sm btn-outline-info mt-2'>إضافة طريقة دفع جديدة</button>`;
        } else {
            paymentExists = false;
            paymentHtml = `<div class="alert alert-warning">لا يوجد طريقة دفع محفوظة.</div><button id='show-add-payment' class='btn btn-sm btn-outline-info mt-2'>إضافة طريقة دفع جديدة</button>`;
        }
        logCheckoutDebug('Payments:', payments, 'Selected:', selectedPaymentId);
        document.getElementById('payment-section').innerHTML = paymentHtml;
        // Add payment method logic
        const showAddPaymentBtn = document.getElementById('show-add-payment');
        if (showAddPaymentBtn) {
            showAddPaymentBtn.onclick = function() {
                document.getElementById('payment-section').style.display = 'none';
                document.getElementById('payment-form-section').style.display = '';
                document.getElementById('payment-form-section').innerHTML = `
                    <form id="add-payment-form-page">
                        <div class="mb-2">
                            <label class="form-label">نوع الدفع</label>
                            <select class="form-select" id="page-payment-type" required>
                                <option value="1">بطاقة بنكية</option>
                                <option value="2">فودافون كاش</option>
                                <option value="3">أمان</option>
                            </select>
                        </div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-provider" placeholder="اسم البنك أو مزود الخدمة" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-payment-account" placeholder="رقم الحساب / البطاقة" required></div>
                        <div class="mb-2"><input type="date" class="form-control" id="page-payment-expiry" placeholder="تاريخ الانتهاء" required></div>
                        <button type="submit" class="btn btn-info w-100">حفظ طريقة الدفع</button>
                    </form>`;
                document.getElementById('add-payment-form-page').onsubmit = async function(e) {
                    e.preventDefault();
                    const payment_type = document.getElementById('page-payment-type').value;
                    const provider = document.getElementById('page-payment-provider').value.trim();
                    const account_number = document.getElementById('page-payment-account').value.trim();
                    const expiry_date = document.getElementById('page-payment-expiry').value;
                    if (!payment_type || !provider || !account_number || !expiry_date) { alert('يرجى تعبئة جميع الحقول'); return; }
                    try {
                        const res = await fetch('/api/accounts/profile/payment-methods/', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ payment_type, provider, account_number, expiry_date })
                        });
                        if (res.ok) {
                            logCheckoutDebug('Payment method added successfully');
                            document.getElementById('payment-form-section').style.display = 'none';
                            document.getElementById('payment-section').style.display = '';
                            await loadCheckoutContent();
                        } else {
                            logCheckoutDebug('Failed to save payment method', res.status);
                            alert('فشل حفظ طريقة الدفع');
                        }
                    } catch (e) { logCheckoutDebug('Error saving payment method', e); alert('خطأ في الاتصال بالخادم'); }
                };
            };
        }
        // Payment method selection
        document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.addEventListener('change', function() {
                selectedPaymentId = parseInt(this.value);
                logCheckoutDebug('Payment method selected:', selectedPaymentId);
            });
        });
        // Add address logic
        const showAddAddressBtn = document.getElementById('show-add-address');
        if (showAddAddressBtn) {
            showAddAddressBtn.onclick = function() {
                document.getElementById('address-section').style.display = 'none';
                document.getElementById('payment-form-section').style.display = 'none';
                document.getElementById('address-section').innerHTML = `
                    <form id="add-address-form-page">
                        <div class="mb-2"><input type="text" class="form-control" id="page-address-city" placeholder="المدينة" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-address-street" placeholder="الشارع" required></div>
                        <div class="mb-2"><input type="text" class="form-control" id="page-address-country" placeholder="الدولة" required></div>
                        <button type="submit" class="btn btn-info w-100">حفظ العنوان</button>
                    </form>`;
                document.getElementById('add-address-form-page').onsubmit = async function(e) {
                    e.preventDefault();
                    const city = document.getElementById('page-address-city').value.trim();
                    const street = document.getElementById('page-address-street').value.trim();
                    const country = document.getElementById('page-address-country').value.trim();
                    if (!city || !street || !country) { alert('يرجى تعبئة جميع الحقول'); return; }
                    try {
                        const res = await fetch('/api/accounts/profile/add-address/', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ city, street, country })
                        });
                        if (res.ok) {
                            document.getElementById('address-section').style.display = '';
                            await loadCheckoutContent();
                        } else {
                            alert('فشل حفظ العنوان');
                        }
                    } catch (e) { alert('خطأ في الاتصال بالخادم'); }
                };
            };
        }
        loader.style.display = 'none';
        form.style.display = '';
    }

    await loadCheckoutContent();

    form.onsubmit = async function(e) {
        e.preventDefault();
        logCheckoutDebug('Confirm order clicked', {addressExists, paymentExists, selectedPaymentId});
        if (!addressExists) { alert('يرجى إضافة عنوان أولاً'); logCheckoutDebug('No address exists'); return; }
        if (!paymentExists || !selectedPaymentId) { alert('يرجى اختيار أو إضافة طريقة دفع أولاً'); logCheckoutDebug('No payment exists or selected'); return; }
        form.querySelector('button[type="submit"]').disabled = true;
        form.querySelector('button[type="submit"]').textContent = '...جاري إتمام الطلب';
        try {
            logCheckoutDebug('Sending order POST', {payment_method: selectedPaymentId});
            const response = await fetch('/api/orders/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': window.CART_CONFIG.csrfToken,
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include',
                body: JSON.stringify({ payment_method: selectedPaymentId })
            });
            logCheckoutDebug('Order POST response', response.status);
            if (response.ok) {
                const data = await response.json();
                logCheckoutDebug('Order created successfully', data);
                window.location.href = '/orders/';
            } else {
                const err = await response.json().catch(() => ({}));
                logCheckoutDebug('Order creation failed', err);
                alert(err.detail || 'حدث خطأ أثناء إتمام الطلب.');
            }
        } catch (e) {
            logCheckoutDebug('Order POST error', e);
            alert('حدث خطأ في الاتصال بالخادم.');
        } finally {
            form.querySelector('button[type="submit"]').disabled = false;
            form.querySelector('button[type="submit"]').textContent = 'تأكيد الطلب والدفع';
        }
    };
});
