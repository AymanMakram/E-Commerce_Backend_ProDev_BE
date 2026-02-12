// frontend/frontend/js/register.js
// Registration page JS: toggles customer/seller fields + submits the registration form.

(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  function getCsrfToken() {
    const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
    return csrfInput ? csrfInput.value : '';
  }

  function getSafeNext() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (!next) return '';

    // Only allow same-site relative paths.
    if (!next.startsWith('/')) return '';
    if (next.startsWith('//')) return '';
    if (next.includes('\\') || next.includes('\n') || next.includes('\r')) return '';

    return next;
  }

  function setError(errorDiv, messages) {
    if (!errorDiv) return;

    const list = Array.isArray(messages) ? messages : [String(messages || '')];
    const cleaned = list.map((m) => String(m).trim()).filter(Boolean);

    if (cleaned.length === 0) {
      errorDiv.classList.add('d-none');
      errorDiv.innerHTML = '';
      return;
    }

    errorDiv.innerHTML = cleaned.map((m) => `• ${esc(m)}`).join('<br>');
    errorDiv.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري إنشاء الحساب...';
    } else {
      btn.disabled = false;
      if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
    }
  }

  function extractErrorMessages(data) {
    if (!data) return ['تعذّر إتمام العملية.'];
    if (typeof data === 'string') return [data];

    if (typeof data === 'object') {
      if (Array.isArray(data)) return data.map(String);

      const messages = [];
      for (const key of Object.keys(data)) {
        const value = data[key];
        if (Array.isArray(value)) {
          for (const item of value) messages.push(String(item));
        } else if (value && typeof value === 'object') {
          for (const nestedKey of Object.keys(value)) {
            const nestedValue = value[nestedKey];
            if (Array.isArray(nestedValue)) {
              for (const item of nestedValue) messages.push(String(item));
            } else {
              messages.push(String(nestedValue));
            }
          }
        } else {
          messages.push(String(value));
        }
      }
      return messages.length ? messages : ['تعذّر إتمام العملية.'];
    }

    return ['تعذّر إتمام العملية.'];
  }

  function initUserTypeMarketingToggle() {
    const radios = document.getElementsByName('user_type');
    const mTitle = document.getElementById('m-title');
    const mDesc = document.getElementById('m-desc');
    const customerFields = document.getElementById('customer-fields');
    const sellerFields = document.getElementById('seller-fields');

    const phoneInput = document.getElementById('phone_number');
    const storeInput = document.getElementById('store_name');
    const sellerPhoneInput = document.getElementById('seller_phone');
    const taxInput = document.getElementById('tax_number');

    if (!radios || !mTitle || !mDesc || !customerFields || !sellerFields) return;

    const marketingText = {
      customer: {
        title: 'تسوّق بذكاء.. عالم من الخيارات <span class="text-cyan">بين يديك</span>',
        desc: 'اكتشف أفضل المنتجات بأفضل الأسعار في تجربة تسوق استثنائية صُممت لأجلك.',
      },
      seller: {
        title: 'حوّل شغفك إلى <span class="text-cyan">أرباح</span> لا تتوقف',
        desc: 'انضم إلى المنصة الأكثر نمواً وابدأ ببيع منتجاتك لآلاف العملاء في دقائق.',
      },
    };

    function applyType(type) {
      if (!marketingText[type]) return;

      mTitle.style.opacity = '0';
      mDesc.style.opacity = '0';

      window.setTimeout(() => {
        mTitle.innerHTML = marketingText[type].title;
        mDesc.innerText = marketingText[type].desc;
        mTitle.style.opacity = '1';
        mDesc.style.opacity = '1';
      }, 200);

      if (type === 'seller') {
        sellerFields.classList.remove('d-none');
        customerFields.classList.add('d-none');

        if (storeInput) storeInput.required = true;
        if (sellerPhoneInput) sellerPhoneInput.required = true;
        if (taxInput) taxInput.required = true;
        if (phoneInput) phoneInput.required = false;
      } else {
        customerFields.classList.remove('d-none');
        sellerFields.classList.add('d-none');

        if (phoneInput) phoneInput.required = true;
        if (storeInput) storeInput.required = false;
        if (sellerPhoneInput) sellerPhoneInput.required = false;
        if (taxInput) taxInput.required = false;
      }
    }

    Array.from(radios).forEach((radio) => {
      radio.addEventListener('change', function () {
        applyType(this.value);
      });
    });

    const selected = Array.from(radios).find((r) => r.checked)?.value;
    if (selected) applyType(selected);
  }

  function initRegistrationSubmit() {
    const registerForm = document.getElementById('register-form');
    if (!registerForm) return;

    const errorDiv = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');

    // Preserve ?next= to login page link.
    const safeNext = getSafeNext();
    const loginLink = document.querySelector('.login-footer a');
    if (loginLink && safeNext) {
      const url = new URL(loginLink.href, window.location.origin);
      url.searchParams.set('next', safeNext);
      loginLink.href = url.toString();
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(errorDiv, []);

      const username = (document.getElementById('reg-username')?.value || '').trim();
      const email = (document.getElementById('reg-email')?.value || '').trim();
      const password = document.getElementById('reg-password')?.value || '';
      const confirmPassword = document.getElementById('confirm-password')?.value || '';
      const userType = document.querySelector('input[name="user_type"]:checked')?.value || 'customer';

      const phone = (document.getElementById('phone_number')?.value || '').trim();
      const storeName = (document.getElementById('store_name')?.value || '').trim();
      const sellerPhone = (document.getElementById('seller_phone')?.value || '').trim();
      const taxNumber = (document.getElementById('tax_number')?.value || '').trim();

      const clientErrors = [];

      if (!username || !email || !password || !confirmPassword) {
        clientErrors.push('يرجى ملء جميع الحقول الأساسية.');
      }

      if (password !== confirmPassword) {
        clientErrors.push('كلمات المرور غير متطابقة.');
      }

      if (password.length < 8) {
        clientErrors.push('كلمة المرور يجب أن تكون 8 رموز على الأقل.');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        clientErrors.push('صيغة البريد الإلكتروني غير صحيحة.');
      }

      const phoneRegex = /^\+?[1-9]\d{6,14}$/;

      if (userType === 'customer') {
        if (!phone) clientErrors.push('رقم الهاتف الجوال إلزامي للمتسوق.');
        else if (!phoneRegex.test(phone)) clientErrors.push('رقم الهاتف غير صحيح.');
      } else if (userType === 'seller') {
        if (!storeName) clientErrors.push('اسم علامتك التجارية حقل إلزامي للتاجر.');
        if (!sellerPhone) clientErrors.push('رقم هاتف المتجر حقل إلزامي للتاجر.');
        if (!taxNumber) clientErrors.push('الرقم الضريبي حقل إلزامي للتاجر.');

        if (sellerPhone && !phoneRegex.test(sellerPhone)) clientErrors.push('رقم هاتف المتجر غير صحيح.');
        if (taxNumber && (taxNumber.length !== 9 || Number.isNaN(Number(taxNumber)))) {
          clientErrors.push('الرقم الضريبي يجب أن يتكون من 9 أرقام.');
        }
      }

      if (clientErrors.length) {
        setError(errorDiv, clientErrors);
        return;
      }

      const payload = {
        username,
        email,
        password,
        user_type: userType,
        phone_number: phone,
        store_name: storeName,
        seller_phone: sellerPhone,
        tax_number: taxNumber,
      };

      setLoading(btn, true);

      try {
        const response = await fetch('/api/accounts/register/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);

        if (response.ok) {
          alert('أهلاً بك في Velo Store! تم التسجيل بنجاح.');
          const loginUrl = new URL('/api/accounts/login-view/', window.location.origin);
          if (safeNext) loginUrl.searchParams.set('next', safeNext);
          window.location.replace(loginUrl.toString());
          return;
        }

        setError(errorDiv, extractErrorMessages(data));
      } catch {
        setError(errorDiv, ['عذراً، حدث خطأ في الاتصال بالسيرفر.']);
      } finally {
        setLoading(btn, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initUserTypeMarketingToggle();
    initRegistrationSubmit();
  });
})();
