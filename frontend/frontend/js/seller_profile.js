// frontend/frontend/js/seller_profile.js

(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  const metaEl = byId('seller-meta');
  const form = byId('seller-profile-form');
  const alertEl = byId('sp-alert');

  const usernameEl = byId('sp-username');
  const userTypeEl = byId('sp-user-type');
  const storeNameEl = byId('sp-store-name');
  const taxNumberEl = byId('sp-tax-number');
  const phoneEl = byId('sp-phone');
  const emailEl = byId('sp-email');

  const saveBtn = byId('sp-save');
  const saveText = byId('sp-save-text');
  const saveSpinner = byId('sp-save-spinner');

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    alert(message);
  }

  function setAlert(message, type = 'info') {
    if (!alertEl) return;
    if (!message) {
      alertEl.classList.add('d-none');
      alertEl.textContent = '';
      alertEl.className = 'alert d-none mt-3 mb-0';
      return;
    }

    alertEl.className = `alert alert-${type} mt-3 mb-0`;
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
  }

  async function readJsonSafe(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function setLoading(isLoading) {
    if (saveBtn) saveBtn.disabled = isLoading;
    if (saveSpinner) saveSpinner.classList.toggle('d-none', !isLoading);
    if (saveText) saveText.textContent = isLoading ? 'جارٍ الحفظ...' : 'حفظ';
  }

  function normalizePhone(value) {
    const v = String(value || '').trim();
    return v;
  }

  function fillForm(profile) {
    if (!profile) return;

    if (metaEl) metaEl.textContent = `#${profile.id} • ${profile.username || ''}`;

    if (usernameEl) usernameEl.value = profile.username || '';
    if (userTypeEl) userTypeEl.value = profile.user_type || '';

    if (storeNameEl) storeNameEl.value = profile.store_name || '';
    if (taxNumberEl) taxNumberEl.value = profile.tax_number || '';

    if (phoneEl) phoneEl.value = profile.phone_number || '';
    if (emailEl) emailEl.value = profile.email || '';
  }

  async function loadProfile() {
    if (typeof window.request !== 'function') {
      setAlert('تعذر تحميل عميل الشبكة (request).', 'danger');
      return null;
    }

    const res = await window.request('/api/accounts/profile/me/', { method: 'GET' });
    if (!res) return null;
    const data = await readJsonSafe(res);
    if (!res.ok) {
      setAlert('فشل تحميل بيانات الحساب.', 'danger');
      return null;
    }

    return data;
  }

  async function saveProfile() {
    const payload = {
      email: String(emailEl?.value || '').trim(),
      phone_number: normalizePhone(phoneEl?.value),
      store_name: String(storeNameEl?.value || '').trim(),
      tax_number: String(taxNumberEl?.value || '').trim(),
    };

    const res = await window.request('/api/accounts/profile/me/', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res) return null;

    const data = await readJsonSafe(res);
    if (!res.ok) {
      const msg = (data && (data.detail || data.email || data.phone_number)) ? JSON.stringify(data) : 'تعذر حفظ البيانات.';
      setAlert(msg, 'danger');
      return null;
    }

    return data;
  }

  async function init() {
    setAlert('', 'info');

    const profile = await loadProfile();
    if (!profile) return;

    if (profile.user_type !== 'seller') {
      // Extra safety: this page is seller-only; bounce to customer flow.
      window.location.replace('/products/');
      return;
    }

    fillForm(profile);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlert('', 'info');

      setLoading(true);
      try {
        const saved = await saveProfile();
        if (!saved) return;
        fillForm(saved);
        setAlert('تم حفظ الإعدادات بنجاح.', 'success');
        showToast('تم حفظ الإعدادات.', 'success');
      } finally {
        setLoading(false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
