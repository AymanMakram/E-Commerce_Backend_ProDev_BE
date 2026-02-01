document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('register-form');
    
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const errorDiv = document.getElementById('register-error');
            const btn = document.getElementById('register-btn');

            // 1. استخراج القيم وتنظيفها
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const userType = document.querySelector('input[name="user_type"]:checked').value;
            
            // حقول إضافية حسب النوع
            const phone = document.getElementById('phone_number').value.trim();
            const storeName = document.getElementById('store_name').value.trim();
            const sellerPhone = document.getElementById('seller_phone').value.trim();
            const taxNumber = document.getElementById('tax_number').value.trim();

            let clientErrors = [];

            // 2. الـ Validation القوي (إلزامية الحقول والتحقق من النسق)
            
            // أ- التحقق من الحقول الأساسية
            if (!username || !email || !password || !confirmPassword) {
                clientErrors.push("يرجى ملء جميع الحقول الأساسية.");
            }

            // ب- فحص تطابق وقوة كلمة المرور
            if (password !== confirmPassword) {
                clientErrors.push("كلمات المرور غير متطابقة!");
            }
            if (password.length < 8) {
                clientErrors.push("كلمة المرور يجب أن تكون 8 رموز على الأقل.");
            }

            // ج- فحص نسق الإيميل
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                clientErrors.push("صيغة البريد الإلكتروني غير صحيحة.");
            }

            // د- فحص الحقول الإجبارية بناءً على نوع المستخدم (المنطق الجديد)
            const phoneRegex = /^01[0125][0-9]{8}$/;

            if (userType === 'customer') {
                if (!phone) {
                    clientErrors.push("رقم الهاتف الجوال إلزامي للمتسوق.");
                } else if (!phoneRegex.test(phone)) {
                    clientErrors.push("رقم الهاتف المصري غير صحيح.");
                }
            } else if (userType === 'seller') {
                // التحقق من وجود البيانات
                if (!storeName) clientErrors.push("اسم علامتك التجارية حقل إلزامي للتاجر.");
                if (!sellerPhone) clientErrors.push("رقم هاتف المتجر حقل إلزامي للتاجر.");
                if (!taxNumber) clientErrors.push("الرقم الضريبي حقل إلزامي للتاجر.");

                // التحقق من صحة الأرقام إذا وجدت
                if (sellerPhone && !phoneRegex.test(sellerPhone)) {
                    clientErrors.push("رقم هاتف المتجر غير صحيح.");
                }
                if (taxNumber && (taxNumber.length !== 9 || isNaN(taxNumber))) {
                    clientErrors.push("الرقم الضريبي يجب أن يتكون من 9 أرقام.");
                }
            }

            // عرض أخطاء الـ Frontend وتوقف الإرسال
            if (clientErrors.length > 0) {
                errorDiv.innerHTML = clientErrors.map(err => `• ${err}`).join('<br>');
                errorDiv.classList.remove('d-none');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            // 3. تجهيز البيانات (Payload)
            const payload = {
                username: username,
                email: email,
                password: password,
                user_type: userType,
                phone_number: phone,
                store_name: storeName,
                seller_phone: sellerPhone,
                tax_number: taxNumber
            };

            // تعطيل الزرار وتغيير مظهره أثناء المعالجة
            btn.disabled = true;
            const originalBtnText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري التحقق...';
            errorDiv.classList.add('d-none');

            try {
                const response = await fetch('/api/accounts/register/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    alert('أهلاً بك في Velo Store! تم التسجيل بنجاح.');
                    window.location.replace('/api/accounts/login-view/');
                } else {
                    let serverErrors = "";
                    for (const key in data) {
                        const errorMsg = Array.isArray(data[key]) ? data[key][0] : data[key];
                        serverErrors += `• ${errorMsg}<br>`;
                    }
                    errorDiv.innerHTML = serverErrors;
                    errorDiv.classList.remove('d-none');
                }
            } catch (err) {
                errorDiv.innerHTML = '• عذراً، حدث خطأ في الاتصال بالسيرفر.';
                errorDiv.classList.remove('d-none');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        });
    }
});