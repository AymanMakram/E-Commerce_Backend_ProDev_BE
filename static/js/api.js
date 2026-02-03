// static/js/api.js

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

window.getAuthHeaders = function(extraHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken'),
        ...extraHeaders
    };
    const token = localStorage.getItem('access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

window.handleAuthError = function(response) {
    if (response.status === 401 || response.status === 403) {
        // Token expired or unauthorized
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.replace('/api/accounts/login-view/');
        return true;
    }
    return false;
};

window.apiFetch = async function(url, options = {}) {
    const finalOptions = { credentials: 'include', ...options };
    finalOptions.headers = window.getAuthHeaders(finalOptions.headers || {});

    const response = await fetch(url, finalOptions);
    if (window.handleAuthError(response)) return null;
    return response;
};