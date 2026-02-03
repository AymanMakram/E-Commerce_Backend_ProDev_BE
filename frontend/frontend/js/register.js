document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;

  const errorDiv = document.getElementById('register-error');
  const btn = document.getElementById('register-btn');

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

  function setError(messages) {
    if (!errorDiv) return;

    const list = Array.isArray(messages) ? messages : [String(messages || '')];
    const cleaned = list.map((m) => String(m).trim()).filter(Boolean);

    if (cleaned.length === 0) {
      errorDiv.classList.add('d-none');
      errorDiv.innerHTML = '';
      return;
    }

    errorDiv.innerHTML = cleaned.map((m) => `• ${m}`).join('<br>');
    errorDiv.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setLoading(isLoading) {
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
      if (Array.isArray(data)) {
        return data.map(String);
      }

      const messages = [];
      for (const key of Object.keys(data)) {
        const value = data[key];
        if (Array.isArray(value)) {
          for (const item of value) messages.push(String(item));
        } else if (value && typeof value === 'object') {
          // Nested DRF errors
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

  // Preserve ?next= to login page after successful register.
  const safeNext = getSafeNext();
  const loginLink = document.querySelector('.login-footer a');
  if (loginLink && safeNext) {
    const url = new URL(loginLink.href, window.location.origin);
    url.searchParams.set('next', safeNext);
    loginLink.href = url.toString();
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError([]);

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

    const phoneRegex = /^01[0125][0-9]{8}$/;

    if (userType === 'customer') {
      if (!phone) clientErrors.push('رقم الهاتف الجوال إلزامي للمتسوق.');
      else if (!phoneRegex.test(phone)) clientErrors.push('رقم الهاتف المصري غير صحيح.');
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
      setError(clientErrors);
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

    setLoading(true);

    try {
      const response = await fetch('/api/accounts/register/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        alert('أهلاً بك في Velo Store! تم التسجيل بنجاح.');

        const loginUrl = new URL('/api/accounts/login-view/', window.location.origin);
        if (safeNext) loginUrl.searchParams.set('next', safeNext);
        window.location.replace(loginUrl.toString());
        return;
      }

      setError(extractErrorMessages(data));
    } catch {
      setError(['عذراً، حدث خطأ في الاتصال بالسيرفر.']);
    } finally {
      setLoading(false);
    }
  });
});
