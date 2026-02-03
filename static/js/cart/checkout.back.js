document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.querySelector('a.btn.btn-light');
    if (backBtn) {
        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/cart/';
        });
    }
});
