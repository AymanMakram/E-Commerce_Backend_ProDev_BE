// static/js/auth.js

// Utility: Get CSRF token from cookie
function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    return '';
}

// Utility: Get JWT from localStorage
function getJWT() {
    return localStorage.getItem('jwt_token') || '';
}

// Centralized headers for all API requests
window.getAuthHeaders = function() {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCSRFToken()
    };
    const jwt = getJWT();
    if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
    return headers;
};

// Handle 401/403 globally
window.handleAuthError = function(response) {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('jwt_token');
        window.location.href = '/auth/login/';
        return true;
    }
    return false;
};