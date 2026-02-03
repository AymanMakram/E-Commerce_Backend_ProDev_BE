document.addEventListener('DOMContentLoaded', function() {
    // Fetch countries and populate country select
    fetch('/api/accounts/countries/')
        .then(res => res.json())
        .then(countries => {
            const countrySelect = document.getElementById('address-country');
            if (countrySelect && Array.isArray(countries)) {
                countrySelect.innerHTML = '<option value="">اختر الدولة</option>';
                countries.forEach(c => {
                    countrySelect.innerHTML += `<option value="${c.id}">${c.country_name}</option>`;
                });
            }
        });
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.replace('/api/accounts/login-view/');
        return;
    }
    // Fetch profile data
    fetch('/api/accounts/profile/me/', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById('profile-username').value = data.username;
        document.getElementById('profile-email').value = data.email;
        document.getElementById('profile-phone').value = data.phone_number || '';
        // Render addresses
        const addressList = document.getElementById('address-list');
        addressList.innerHTML = '';
        (data.addresses || []).forEach(addr => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = `${addr.city}, ${addr.street}, ${addr.country}`;
            addressList.appendChild(li);
        });
    });
    // Update profile
    document.getElementById('profile-form').onsubmit = function(e) {
        e.preventDefault();
        fetch('/api/accounts/profile/me/', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: document.getElementById('profile-email').value,
                phone_number: document.getElementById('profile-phone').value
            })
        })
        .then(res => res.json())
        .then(data => {
            alert('تم تحديث البيانات بنجاح!');
        });
    };
    // Add address (simple prompt for demo)
    // Modern modal for adding address
        // Use static modal in HTML, attach events
        const addAddressModalEl = document.getElementById('addAddressModal');
        const addAddressModal = addAddressModalEl ? new bootstrap.Modal(addAddressModalEl) : null;
        const addAddressBtn = document.getElementById('add-address-btn');
        const addAddressForm = document.getElementById('add-address-form');
        if (addAddressBtn && addAddressModal && addAddressForm) {
                addAddressBtn.onclick = function() {
                        addAddressForm.reset();
                        addAddressModal.show();
                };
                addAddressForm.onsubmit = function(e) {
                        e.preventDefault();
                        // Collect all required fields for AddressSerializer
                        const city = document.getElementById('address-city').value.trim();
                        const street = document.getElementById('address-street').value.trim();
                        const country = document.getElementById('address-country').value;
                        // Optional fields
                        const unit_number = document.getElementById('address-unit') ? document.getElementById('address-unit').value.trim() : '';
                        const street_number = document.getElementById('address-street-number') ? document.getElementById('address-street-number').value.trim() : '';
                        const address_line1 = document.getElementById('address-line1') ? document.getElementById('address-line1').value.trim() : street;
                        const address_line2 = document.getElementById('address-line2') ? document.getElementById('address-line2').value.trim() : '';
                        const region = document.getElementById('address-region') ? document.getElementById('address-region').value.trim() : '';
                        const postal_code = document.getElementById('address-postal') ? document.getElementById('address-postal').value.trim() : '';
                        if (!city || !street || !country) {
                                alert('يرجى تعبئة جميع الحقول الإلزامية');
                                return;
                        }
                        fetch('/api/accounts/profile/add-address/', {
                                method: 'POST',
                                headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                        city, street, country,
                                        unit_number, street_number, address_line1, address_line2, region, postal_code
                                })
                        })
                        .then(res => res.json())
                        .then(data => {
                                addAddressModal.hide();
                                alert('تمت إضافة العنوان!');
                                location.reload();
                        });
                };
        }
});
