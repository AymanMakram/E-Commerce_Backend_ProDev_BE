// frontend/frontend/js/profile.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const profileForm = byId('profile-form');
  const usernameInput = byId('profile-username');
  const emailInput = byId('profile-email');
  const phoneInput = byId('profile-phone');

  const addressList = byId('address-list');
  const addAddressBtn = byId('add-address-btn');
  const addAddressModalEl = byId('addAddressModal');
  const addAddressForm = byId('add-address-form');
  const addressStepBackBtn = byId('address-step-back');
  const addressStepNextBtn = byId('address-step-next');
  const addressStepIndicator = byId('address-step-indicator');

  const paymentList = byId('payment-list');
  const addPaymentBtn = byId('add-payment-btn');
  const addPaymentModalEl = byId('addPaymentModal');
  const addPaymentForm = byId('add-payment-form');
  const paymentStepBackBtn = byId('payment-step-back');
  const paymentStepNextBtn = byId('payment-step-next');
  const paymentStepIndicator = byId('payment-step-indicator');

  const countrySelect = byId('address-country');
  const paymentTypeSelect = byId('payment-type');

  const paymentProviderGroup = byId('payment-provider-group');
  const paymentAccountGroup = byId('payment-account-group');
  const paymentExpiryGroup = byId('payment-expiry-group');
  const paymentCodNote = byId('payment-cod-note');

  const paymentProviderInput = byId('payment-provider');
  const paymentAccountInput = byId('payment-account');
  const paymentExpiryInput = byId('payment-expiry');

  const nextLink = byId('profile-next-link');

  const missingAlert = byId('profile-missing-alert');
  const progressBar = byId('profile-progress');
  const progressText = byId('profile-progress-text');
  const profileSaveBtn = byId('profile-save-btn');
  const addAddressSubmitBtn = byId('add-address-submit');
  const addPaymentSubmitBtn = byId('add-payment-submit');

  let editingAddressId = null;
  let editingPaymentId = null;

  let paymentTypesById = new Map();

  const esc = (value) => {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  async function readJsonSafe(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function extractErrorMessage(err, fallback) {
    if (typeof err === 'string' && err.trim()) return err;
    if (err && typeof err.detail === 'string' && err.detail.trim()) return err.detail;
    if (err && typeof err === 'object') {
      for (const key of Object.keys(err)) {
        const v = err[key];
        if (Array.isArray(v) && v.length) {
          const first = v[0];
          if (typeof first === 'string') return first;
          if (first && typeof first === 'object' && typeof first.detail === 'string') return first.detail;
        }
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
    return fallback || 'حدث خطأ غير متوقع.';
  }

  function setButtonLoading(button, isLoading, labelWhenIdle) {
    if (!button) return;
    if (isLoading) {
      button.disabled = true;
      button.dataset.prevHtml = button.innerHTML;
      button.innerHTML = `<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span> جاري الحفظ...`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.prevHtml || button.innerHTML;
      if (labelWhenIdle) button.textContent = labelWhenIdle;
    }
  }

  function renderListSkeleton(listEl, rows = 3) {
    if (!listEl) return;
    listEl.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const li = document.createElement('li');
      li.className = 'list-group-item border-0 px-0';
      li.innerHTML = `
        <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
          <div class="d-flex align-items-center">
            <div class="skeleton" style="width:44px;height:44px;border-radius:12px;"></div>
            <div class="flex-grow-1 me-3">
              <div class="skeleton-text mb-2" style="height:12px;width:55%;"></div>
              <div class="skeleton-text" style="height:10px;width:35%;"></div>
            </div>
          </div>
        </div>`;
      listEl.appendChild(li);
    }
  }

  function getNextUrl() {
    try {
      const u = new URL(window.location.href);
      const next = u.searchParams.get('next');
      return (next && next.startsWith('/')) ? next : null;
    } catch (_) {
      return null;
    }
  }

  function setRequired(el, required) {
    if (!el) return;
    if (required) el.setAttribute('required', 'required');
    else el.removeAttribute('required');
  }

  function isCashOnDeliverySelected() {
    const id = String(paymentTypeSelect?.value || '');
    const label = String(paymentTypesById.get(id) || '').toLowerCase();
    // Handle English + Arabic labels
    return label.includes('cash on delivery') || label.includes('cod') || label.includes('الدفع عند الاستلام') || label.includes('استلام');
  }

  function applyPaymentTypeSmartUX() {
    if (!paymentTypeSelect) return;
    const isCOD = isCashOnDeliverySelected();

    if (paymentCodNote) paymentCodNote.classList.toggle('d-none', !isCOD);
    if (paymentProviderGroup) paymentProviderGroup.classList.toggle('d-none', isCOD);
    if (paymentAccountGroup) paymentAccountGroup.classList.toggle('d-none', isCOD);
    if (paymentExpiryGroup) paymentExpiryGroup.classList.toggle('d-none', isCOD);

    // For COD we auto-fill values so backend-required fields are satisfied.
    setRequired(paymentProviderInput, !isCOD);
    setRequired(paymentAccountInput, !isCOD);
    setRequired(paymentExpiryInput, !isCOD);

    if (isCOD) {
      if (paymentProviderInput) paymentProviderInput.value = 'Cash on Delivery';
      if (paymentAccountInput) paymentAccountInput.value = 'COD-0000';
      if (paymentExpiryInput) paymentExpiryInput.value = '2099-12-31';
    }
  }

  function createWizard({
    modalEl,
    stepSelector,
    backBtn,
    nextBtn,
    indicatorEl,
    totalSteps,
    onValidateStep,
    onStepChange,
  }) {
    if (!modalEl) return null;
    const steps = Array.from(modalEl.querySelectorAll(stepSelector));
    if (!steps.length) return null;
    let current = 1;
    const total = totalSteps || steps.length;

    function setIndicator() {
      if (!indicatorEl) return;
      indicatorEl.textContent = `${current} / ${total}`;
    }

    function showStep(n) {
      current = Math.min(Math.max(1, n), total);
      steps.forEach((el) => {
        const stepNum = Number(el.getAttribute('data-step') || '0');
        if (stepNum === current) el.classList.remove('d-none');
        else el.classList.add('d-none');
      });

      if (backBtn) backBtn.disabled = current === 1;
      if (nextBtn) nextBtn.classList.toggle('d-none', current === total);
      setIndicator();
      if (typeof onStepChange === 'function') onStepChange(current, total);
    }

    function reset() {
      showStep(1);
    }

    function next() {
      if (typeof onValidateStep === 'function') {
        const ok = onValidateStep(current);
        if (!ok) return;
      }
      showStep(current + 1);
    }

    function back() {
      showStep(current - 1);
    }

    if (nextBtn) nextBtn.addEventListener('click', next);
    if (backBtn) backBtn.addEventListener('click', back);

    // Bootstrap modal events (optional)
    if (window.bootstrap && window.bootstrap.Modal) {
      modalEl.addEventListener('shown.bs.modal', reset);
    }

    // initial
    showStep(1);
    return { reset, showStep };
  }

  function setProgress(addresses, payments) {
    const steps = [
      { label: 'بيانات الحساب', ok: true },
      { label: 'عنوان', ok: Array.isArray(addresses) && addresses.length > 0 },
      { label: 'طريقة دفع', ok: Array.isArray(payments) && payments.length > 0 },
    ];
    const completed = steps.filter((s) => s.ok).length;
    const total = steps.length;
    const percent = Math.round((completed / total) * 100);

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;

    const next = getNextUrl();
    if (nextLink && next) {
      const canCheckout = (Array.isArray(addresses) && addresses.length > 0) && (Array.isArray(payments) && payments.length > 0);
      nextLink.href = next;
      nextLink.classList.toggle('d-none', !canCheckout);
    }
  }

  function maskAccount(accountNumber) {
    const s = String(accountNumber || '').trim();
    if (s.length <= 4) return s;
    return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }

  function setMissingAlert(addresses, payments) {
    if (!missingAlert) return;
    const missing = [];
    if (!addresses?.length) missing.push('عنوان شحن');
    if (!payments?.length) missing.push('طريقة دفع');

    if (!missing.length) {
      missingAlert.classList.add('d-none');
      missingAlert.textContent = '';
      return;
    }

    missingAlert.classList.remove('d-none');
    missingAlert.textContent = `لا يمكن إتمام الطلب بدون: ${missing.join(' و ')}. أضفها الآن ثم جرّب إتمام الشراء.`;
  }

  async function loadCountries() {
    if (!countrySelect || typeof window.request !== 'function') return;

    const res = await window.request('/api/accounts/countries/');
    if (!res) return;

    const countries = await readJsonSafe(res);
    if (!Array.isArray(countries)) return;

    countrySelect.innerHTML = '<option value="">اختر الدولة</option>';
    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.country_name;
      countrySelect.appendChild(opt);
    });
  }

  async function loadPaymentTypes() {
    if (!paymentTypeSelect || typeof window.request !== 'function') return;

    const res = await window.request('/api/accounts/payment-types/');
    if (!res) return;

    const types = await readJsonSafe(res);
    if (!Array.isArray(types)) return;

    paymentTypesById = new Map(types.map((t) => [String(t.id), String(t.value || '')]));

    paymentTypeSelect.innerHTML = '<option value="">اختر نوع الدفع</option>';
    types.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.value;
      paymentTypeSelect.appendChild(opt);
    });

    applyPaymentTypeSmartUX();
  }

  function renderAddresses(addresses) {
    if (!addressList) return;
    addressList.innerHTML = '';

    if (!Array.isArray(addresses) || addresses.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-group-item text-muted';
      li.textContent = 'لا يوجد عناوين محفوظة.';
      addressList.appendChild(li);
      return;
    }

    addresses.forEach((addr) => {
      const li = document.createElement('li');
      li.className = 'list-group-item border-0 px-0';
      const isDefault = !!addr.is_default;

      const safeId = esc(String(addr.id ?? ''));
      const safeLine1 = esc(addr.address_line1 || 'عنوان');
      const safeCity = esc(addr.city || '');
      const safeRegion = esc(addr.region || '');
      const safePostal = esc(addr.postal_code || '');

      li.innerHTML = `
        <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="fw-bold" style="color:#0f172a;">${safeLine1}</div>
              <div class="text-muted small">${safeCity}${safeRegion ? ' - ' + safeRegion : ''}</div>
              <div class="text-muted small">${safePostal}</div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-info rounded-pill" data-action="addr-default" data-id="${safeId}" ${isDefault ? 'disabled' : ''} style="border-color:#00BCD4;color:#00BCD4;">${isDefault ? 'افتراضي' : 'تعيين كافتراضي'}</button>
                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-action="addr-edit" data-id="${safeId}">تعديل</button>
                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill" data-action="addr-delete" data-id="${safeId}">حذف</button>
              </div>
            </div>
            <span class="badge rounded-pill" style="background:${isDefault ? 'rgba(34,197,94,.12)' : 'rgba(0,188,212,.12)'}; color:${isDefault ? '#16a34a' : '#00BCD4'}; border:1px solid ${isDefault ? 'rgba(34,197,94,.35)' : 'rgba(0,188,212,.35)'};">${isDefault ? 'افتراضي' : 'شحن'}</span>
          </div>
        </div>
      `;
      addressList.appendChild(li);
    });

    // Bind actions
    addressList.querySelectorAll('[data-action="addr-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const addr = (addresses || []).find((a) => String(a.id) === String(id));
        if (addr) openAddressModalForEdit(addr);
      });
    });

    addressList.querySelectorAll('[data-action="addr-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('هل تريد حذف هذا العنوان؟')) return;

        const res = await window.request(`/api/accounts/profile/addresses/${id}/`, { method: 'DELETE' });
        if (!res) return;
        if (res.ok) {
          showToast('تم حذف العنوان.', 'info');
          await loadProfile();
        } else {
          const err = await readJsonSafe(res);
          showToast(extractErrorMessage(err, 'فشل حذف العنوان.'), 'danger');
        }
      });
    });

    addressList.querySelectorAll('[data-action="addr-default"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        const res = await window.request(`/api/accounts/profile/addresses/${id}/set-default/`, { method: 'PATCH' });
        if (!res) return;
        if (res.ok) {
          showToast('تم تحديث العنوان الافتراضي.', 'success');
          await loadProfile();
        } else {
          const err = await readJsonSafe(res);
          showToast(extractErrorMessage(err, 'فشل تعيين العنوان الافتراضي.'), 'danger');
        }
      });
    });
  }

  function renderPaymentMethods(payments) {
    if (!paymentList) return;
    paymentList.innerHTML = '';

    if (!Array.isArray(payments) || payments.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-group-item text-muted';
      li.textContent = 'لا توجد طرق دفع محفوظة.';
      paymentList.appendChild(li);
      return;
    }

    payments.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'list-group-item border-0 px-0';
      const typeName = p.payment_type_name || 'Payment';
      const provider = p.provider || '';
      const masked = maskAccount(p.account_number);
      const expiry = p.expiry_date || '';
      const isDefault = !!p.is_default;

      const safeId = esc(String(p.id ?? ''));
      const safeTypeName = esc(typeName);
      const safeProvider = esc(provider);
      const safeMasked = esc(masked);
      const safeExpiry = esc(expiry);
      const safeStatus = esc(p.payment_status || 'Success');

      li.innerHTML = `
        <div class="card border-0 shadow-sm p-3" style="border-radius:16px;">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-bold" style="color:#0f172a;">${safeTypeName}${isDefault ? ' <span class="badge ms-1" style="background:#00BCD4;color:#0f172a;">افتراضي</span>' : ''}</div>
              <div class="text-muted small">${safeProvider} • ${safeMasked} • ${safeExpiry}</div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-info rounded-pill" data-action="pm-default" data-id="${safeId}" ${isDefault ? 'disabled' : ''} style="border-color:#00BCD4;color:#00BCD4;">${isDefault ? 'افتراضي' : 'تعيين كافتراضي'}</button>
                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-action="pm-edit" data-id="${safeId}">تعديل</button>
                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill" data-action="pm-delete" data-id="${safeId}">حذف</button>
              </div>
            </div>
            <span class="badge rounded-pill" style="background:rgba(34,197,94,.12); color:#16a34a; border:1px solid rgba(34,197,94,.35);">${safeStatus}</span>
          </div>
        </div>
      `;
      paymentList.appendChild(li);
    });

    paymentList.querySelectorAll('[data-action="pm-edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const pm = (payments || []).find((x) => String(x.id) === String(id));
        if (pm) await openPaymentModalForEdit(pm);
      });
    });

    paymentList.querySelectorAll('[data-action="pm-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('هل تريد حذف طريقة الدفع؟')) return;

        const res = await window.request(`/api/accounts/profile/payment-methods/${id}/`, { method: 'DELETE' });
        if (!res) return;
        if (res.ok) {
          showToast('تم حذف طريقة الدفع.', 'info');
          await loadProfile();
        } else {
          const err = await readJsonSafe(res);
          showToast(extractErrorMessage(err, 'فشل حذف طريقة الدفع.'), 'danger');
        }
      });
    });

    paymentList.querySelectorAll('[data-action="pm-default"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        const res = await window.request(`/api/accounts/profile/payment-methods/${id}/set-default/`, { method: 'PATCH' });
        if (!res) return;
        if (res.ok) {
          showToast('تم تحديث طريقة الدفع الافتراضية.', 'success');
          await loadProfile();
        } else {
          const err = await readJsonSafe(res);
          showToast(extractErrorMessage(err, 'فشل تعيين الافتراضي.'), 'danger');
        }
      });
    });
  }

  function focusFirstVisibleInput(modalEl) {
    if (!modalEl) return;
    const input = modalEl.querySelector('input:not([type="hidden"]):not([disabled]):not(.d-none), select:not([disabled])');
    if (input && typeof input.focus === 'function') input.focus();
  }

  function openAddressModalForEdit(addr) {
    if (!addAddressModalEl || !addAddressForm) return;
    editingAddressId = addr.id;

    // Prefill
    byId('address-line1').value = addr.address_line1 || '';
    byId('address-line2').value = addr.address_line2 || '';
    byId('address-city').value = addr.city || '';
    byId('address-region').value = addr.region || '';
    byId('address-postal').value = addr.postal_code || '';
    byId('address-unit').value = addr.unit_number || '';
    byId('address-street-number').value = addr.street_number || '';
    const countryVal = String(addr.country || '');
    if (byId('address-country') && countryVal) byId('address-country').value = countryVal;
    if (byId('address-default')) byId('address-default').checked = !!addr.is_default;

    const title = addAddressModalEl.querySelector('.modal-title');
    if (title) title.textContent = 'تعديل العنوان';
    if (addAddressSubmitBtn) addAddressSubmitBtn.textContent = 'حفظ';

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(addAddressModalEl) : null;
    modal?.show();
    focusFirstVisibleInput(addAddressModalEl);
  }

  async function openPaymentModalForEdit(pm) {
    if (!addPaymentModalEl || !addPaymentForm) return;
    editingPaymentId = pm.id;
    addPaymentForm.reset();
    await loadPaymentTypes();

    if (paymentTypeSelect) paymentTypeSelect.value = pm.payment_type;
    if (paymentProviderInput) paymentProviderInput.value = pm.provider || '';
    if (paymentAccountInput) paymentAccountInput.value = pm.account_number || '';
    if (paymentExpiryInput) paymentExpiryInput.value = pm.expiry_date || '';
    if (byId('payment-default')) byId('payment-default').checked = !!pm.is_default;

    applyPaymentTypeSmartUX();

    const title = addPaymentModalEl.querySelector('.modal-title');
    if (title) title.textContent = 'تعديل طريقة الدفع';
    if (addPaymentSubmitBtn) addPaymentSubmitBtn.textContent = 'حفظ';

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(addPaymentModalEl) : null;
    modal?.show();
    focusFirstVisibleInput(addPaymentModalEl);
  }

  async function loadProfile() {
    if (typeof window.request !== 'function') return;

    renderListSkeleton(addressList, 3);
    renderListSkeleton(paymentList, 2);
    if (progressText) progressText.textContent = '...';

    const res = await window.request('/api/accounts/profile/me/');
    if (!res) return;

    const data = await readJsonSafe(res);
    if (!data) return;

    if (usernameInput) usernameInput.value = data.username || '';
    if (emailInput) emailInput.value = data.email || '';
    if (phoneInput) phoneInput.value = data.phone_number || '';

    renderAddresses(data.addresses);
    renderPaymentMethods(data.payment_methods);
    setMissingAlert(data.addresses, data.payment_methods);
    setProgress(data.addresses, data.payment_methods);
  }

  function bindProfileUpdate() {
    if (!profileForm || typeof window.request !== 'function') return;

    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      setButtonLoading(profileSaveBtn, true);

      const payload = {
        email: (emailInput?.value || '').trim(),
        phone_number: (phoneInput?.value || '').trim(),
      };

      const res = await window.request('/api/accounts/profile/me/', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!res) {
        setButtonLoading(profileSaveBtn, false);
        return;
      }

      if (res.ok) {
        showToast('تم تحديث البيانات بنجاح.', 'success');
        await loadProfile();
      } else {
        const err = await readJsonSafe(res);
        showToast(extractErrorMessage(err, 'فشل تحديث البيانات.'), 'danger');
      }

      setButtonLoading(profileSaveBtn, false);
    });
  }

  function bindAddAddress() {
    if (!addAddressBtn || !addAddressModalEl || !addAddressForm) return;
    if (typeof window.request !== 'function') return;

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(addAddressModalEl) : null;

    const addressWizard = createWizard({
      modalEl: addAddressModalEl,
      stepSelector: '.velo-step[data-step]',
      backBtn: addressStepBackBtn,
      nextBtn: addressStepNextBtn,
      indicatorEl: addressStepIndicator,
      totalSteps: 2,
      onValidateStep: (step) => {
        if (step === 1) {
          const line1 = (byId('address-line1')?.value || '').trim();
          const country = (byId('address-country')?.value || '').trim();
          const city = (byId('address-city')?.value || '').trim();
          if (!line1 || !country || !city) {
            showToast('يرجى تعبئة: العنوان 1، الدولة، المدينة.', 'danger');
            return false;
          }
        }
        if (step === 2) {
          const region = (byId('address-region')?.value || '').trim();
          const postal = (byId('address-postal')?.value || '').trim();
          const unit = (byId('address-unit')?.value || '').trim();
          const streetNo = (byId('address-street-number')?.value || '').trim();
          if (!region || !postal || !unit || !streetNo) {
            showToast('يرجى تعبئة: المنطقة، الرمز البريدي، رقم الوحدة، رقم الشارع.', 'danger');
            return false;
          }
        }
        return true;
      },
    });

    addAddressBtn.addEventListener('click', () => {
      addAddressForm.reset();
      editingAddressId = null;
      const title = addAddressModalEl.querySelector('.modal-title');
      if (title) title.textContent = 'إضافة عنوان جديد';
      if (addAddressSubmitBtn) addAddressSubmitBtn.textContent = 'إضافة';
      addressWizard?.reset();
      if (modal) modal.show();
      focusFirstVisibleInput(addAddressModalEl);
    });

    addAddressForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      setButtonLoading(addAddressSubmitBtn, true);

      const unit_number = (byId('address-unit')?.value || '').trim();
      const street_number = (byId('address-street-number')?.value || '').trim();
      const address_line1 = (byId('address-line1')?.value || byId('address-street')?.value || '').trim();
      const address_line2 = (byId('address-line2')?.value || '').trim();
      const city = (byId('address-city')?.value || '').trim();
      const region = (byId('address-region')?.value || '').trim();
      const postal_code = (byId('address-postal')?.value || '').trim();
      const country = byId('address-country')?.value;

      if (!unit_number || !street_number || !address_line1 || !city || !region || !postal_code || !country) {
        showToast('يرجى تعبئة كل الحقول المطلوبة للعنوان.', 'danger');
        setButtonLoading(addAddressSubmitBtn, false, 'إضافة');
        return;
      }

      const is_default = !!byId('address-default')?.checked;

      const endpoint = editingAddressId
        ? `/api/accounts/profile/addresses/${editingAddressId}/`
        : '/api/accounts/profile/add-address/';

      const res = await window.request(endpoint, {
        method: editingAddressId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          unit_number,
          street_number,
          address_line1,
          address_line2,
          city,
          region,
          postal_code,
          country,
          ...(editingAddressId ? {} : { is_default }),
        }),
      });

      if (!res) {
        setButtonLoading(addAddressSubmitBtn, false, 'إضافة');
        return;
      }

      if (res.ok) {
        if (!editingAddressId && is_default) {
          // Make it default if requested
          try {
            const created = await readJsonSafe(res);
            if (created?.id) {
              await window.request(`/api/accounts/profile/addresses/${created.id}/set-default/`, { method: 'PATCH' });
            }
          } catch (_) {
            // ignore
          }
        }

        showToast(editingAddressId ? 'تم تحديث العنوان.' : 'تمت إضافة العنوان بنجاح.', 'success');
        if (modal) modal.hide();
        editingAddressId = null;
        await loadProfile();
      } else {
        const err = await readJsonSafe(res);
        showToast(extractErrorMessage(err, editingAddressId ? 'فشل تحديث العنوان.' : 'فشل إضافة العنوان.'), 'danger');
      }

      setButtonLoading(addAddressSubmitBtn, false, 'إضافة');
    });
  }

  function bindAddPaymentMethod() {
    if (!addPaymentBtn || !addPaymentModalEl || !addPaymentForm) return;
    if (typeof window.request !== 'function') return;

    const modal = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(addPaymentModalEl) : null;

    const paymentWizard = createWizard({
      modalEl: addPaymentModalEl,
      stepSelector: '.velo-step[data-step]',
      backBtn: paymentStepBackBtn,
      nextBtn: paymentStepNextBtn,
      indicatorEl: paymentStepIndicator,
      totalSteps: 2,
      onValidateStep: (step) => {
        if (step === 1) {
          const typeId = (paymentTypeSelect?.value || '').trim();
          if (!typeId) {
            showToast('يرجى اختيار نوع الدفع.', 'danger');
            return false;
          }
        }
        if (step === 2) {
          if (isCashOnDeliverySelected()) {
            applyPaymentTypeSmartUX();
            return true;
          }
          const provider = (byId('payment-provider')?.value || '').trim();
          const account = (byId('payment-account')?.value || '').trim();
          const expiry = (byId('payment-expiry')?.value || '').trim();
          if (!provider || !account || !expiry) {
            showToast('يرجى تعبئة: Provider، رقم الحساب، تاريخ الانتهاء.', 'danger');
            return false;
          }
        }
        return true;
      },
    });

    addPaymentBtn.addEventListener('click', async () => {
      addPaymentForm.reset();
      editingPaymentId = null;
      await loadPaymentTypes();
      paymentWizard?.reset();
      applyPaymentTypeSmartUX();
      const title = addPaymentModalEl.querySelector('.modal-title');
      if (title) title.textContent = 'إضافة طريقة دفع';
      if (addPaymentSubmitBtn) addPaymentSubmitBtn.textContent = 'إضافة';
      if (modal) modal.show();
      focusFirstVisibleInput(addPaymentModalEl);
    });

    paymentTypeSelect?.addEventListener('change', () => {
      applyPaymentTypeSmartUX();
    });

    addPaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      setButtonLoading(addPaymentSubmitBtn, true);

      applyPaymentTypeSmartUX();

      const payment_type = (paymentTypeSelect?.value || '').trim();
      const provider = (byId('payment-provider')?.value || '').trim();
      const account_number = (byId('payment-account')?.value || '').trim();
      const expiry_date = (byId('payment-expiry')?.value || '').trim();
      const is_default = !!byId('payment-default')?.checked;

      if (!payment_type) {
        showToast('يرجى اختيار نوع الدفع.', 'danger');
        setButtonLoading(addPaymentSubmitBtn, false, 'إضافة');
        return;
      }

      if (!isCashOnDeliverySelected()) {
        if (!provider || !account_number || !expiry_date) {
          showToast('يرجى تعبئة كل الحقول المطلوبة لطريقة الدفع.', 'danger');
          setButtonLoading(addPaymentSubmitBtn, false, 'إضافة');
          return;
        }
      }

      const endpoint = editingPaymentId
        ? `/api/accounts/profile/payment-methods/${editingPaymentId}/`
        : '/api/accounts/profile/payment-methods/';

      const res = await window.request(endpoint, {
        method: editingPaymentId ? 'PATCH' : 'POST',
        body: JSON.stringify({ payment_type, provider, account_number, expiry_date, is_default }),
      });

      if (!res) {
        setButtonLoading(addPaymentSubmitBtn, false, 'إضافة');
        return;
      }

      if (res.ok) {
        showToast(editingPaymentId ? 'تم تحديث طريقة الدفع.' : 'تمت إضافة طريقة الدفع بنجاح.', 'success');
        if (modal) modal.hide();
        editingPaymentId = null;
        await loadProfile();
      } else {
        const err = await readJsonSafe(res);
        showToast(extractErrorMessage(err, editingPaymentId ? 'فشل تحديث طريقة الدفع.' : 'فشل إضافة طريقة الدفع.'), 'danger');
      }

      setButtonLoading(addPaymentSubmitBtn, false, 'إضافة');
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.bindCartBadge === 'function') window.bindCartBadge('cart-count');

    // If not authenticated, request() will redirect on 401/403.
    await loadCountries();
    await loadProfile();

    bindProfileUpdate();
    bindAddAddress();
    bindAddPaymentMethod();
  });
})();
