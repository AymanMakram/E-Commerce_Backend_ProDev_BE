document.addEventListener('DOMContentLoaded', function() {
    console.log("Auth JS Loaded Successfully"); 

    const loginForm = document.getElementById('login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault(); 

            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const errorDiv = document.getElementById('login-error');
            const btn = document.getElementById('login-btn');
            const spinner = document.getElementById('login-spinner');

            if (!usernameInput || !passwordInput) return;

            const username = usernameInput.value;
            const password = passwordInput.value;

            if (errorDiv) { errorDiv.classList.add('d-none'); errorDiv.textContent = ''; }
            if (btn) btn.disabled = true;
            if (spinner) spinner.classList.remove('d-none');

            try {
                const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
                const csrfToken = csrfInput ? csrfInput.value : '';

                const response = await fetch('/api/accounts/login/', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('access_token', data.access);
                    localStorage.setItem('refresh_token', data.refresh);
                    localStorage.setItem('username', username); // حفظ الاسم للـ Navbar
                    
                    window.location.replace('/products/'); 
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.detail || 'تأكد من صحة البيانات.';
                        errorDiv.classList.remove('d-none');
                    }
                }
            } catch (error) {
                if (errorDiv) {
                    errorDiv.textContent = 'تعذر الاتصال بالخادم.';
                    errorDiv.classList.remove('d-none');
                }
            } finally {
                if (btn) btn.disabled = false;
                if (spinner) spinner.classList.add('d-none');
            }
        });
    } else {
        // رسالة إرشادية لا تسبب خطأ أحمر في الكونسول
        console.info("Info: login-form not found on this page, skipping auth logic.");
    }
});

window.handleLogout = function() {
    localStorage.clear(); 
    window.location.replace('/api/accounts/login-view/');
};